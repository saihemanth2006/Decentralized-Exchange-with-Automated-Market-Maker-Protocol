const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function() {
    let dex, tokenA, tokenB;
    let owner, addr1, addr2;
    
    beforeEach(async function() {
        // Deploy tokens and DEX before each test
        [owner, addr1, addr2] = await ethers.getSigners();
        
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA");
        tokenB = await MockERC20.deploy("Token B", "TKB");
        
        const DEX = await ethers.getContractFactory("DEX");
        dex = await DEX.deploy(tokenA.address, tokenB.address);
        
        // Approve DEX to spend tokens
        await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));
    });
    
    describe("Liquidity Management", function() {
        it("should allow initial liquidity provision", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await expect(dex.addLiquidity(amountA, amountB))
                .to.not.be.reverted;
            
            const [reserveA, reserveB] = await dex.getReserves();
            expect(reserveA).to.equal(amountA);
            expect(reserveB).to.equal(amountB);
        });
        
        it("should mint correct LP tokens for first provider", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await dex.addLiquidity(amountA, amountB);
            
            const liquidity = await dex.liquidity(owner.address);
            const expectedLiquidity = ethers.utils.parseEther("141.421356237309504880"); // sqrt(100 * 200)
            
            // Allow for small rounding differences
            expect(liquidity).to.be.closeTo(expectedLiquidity, ethers.utils.parseEther("0.1"));
        });
        
        it("should allow subsequent liquidity additions", async function() {
            // Initial liquidity
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            // Mint tokens to addr1
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000000"));
            await tokenB.mint(addr1.address, ethers.utils.parseEther("1000000"));
            
            // Approve from addr1
            await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
            await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
            
            // Subsequent liquidity from addr1
            await expect(dex.connect(addr1).addLiquidity(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            )).to.not.be.reverted;
            
            const liquidity = await dex.liquidity(addr1.address);
            expect(liquidity).to.be.gt(0);
        });
        
        it("should maintain price ratio on liquidity addition", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const priceBefore = await dex.getPrice();
            
            // Mint and approve for addr1
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000000"));
            await tokenB.mint(addr1.address, ethers.utils.parseEther("1000000"));
            await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
            await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
            
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("50"), ethers.utils.parseEther("100"));
            
            const priceAfter = await dex.getPrice();
            expect(priceAfter).to.equal(priceBefore);
        });
        
        it("should allow partial liquidity removal", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const totalLiquidity = await dex.liquidity(owner.address);
            const removeAmount = totalLiquidity.div(2);
            
            await expect(dex.removeLiquidity(removeAmount))
                .to.not.be.reverted;
            
            const remainingLiquidity = await dex.liquidity(owner.address);
            expect(remainingLiquidity).to.equal(totalLiquidity.sub(removeAmount));
        });
        
        it("should return correct token amounts on liquidity removal", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await dex.addLiquidity(amountA, amountB);
            
            const liquidityAmount = await dex.liquidity(owner.address);
            const balanceABefore = await tokenA.balanceOf(owner.address);
            const balanceBBefore = await tokenB.balanceOf(owner.address);
            
            await dex.removeLiquidity(liquidityAmount);
            
            const balanceAAfter = await tokenA.balanceOf(owner.address);
            const balanceBAfter = await tokenB.balanceOf(owner.address);
            
            expect(balanceAAfter.sub(balanceABefore)).to.equal(amountA);
            expect(balanceBAfter.sub(balanceBBefore)).to.equal(amountB);
        });
        
        it("should revert on zero liquidity addition", async function() {
            await expect(dex.addLiquidity(0, ethers.utils.parseEther("100")))
                .to.be.revertedWith("DEX: insufficient amounts");
            
            await expect(dex.addLiquidity(ethers.utils.parseEther("100"), 0))
                .to.be.revertedWith("DEX: insufficient amounts");
        });
        
        it("should revert when removing more liquidity than owned", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidity = await dex.liquidity(owner.address);
            
            await expect(dex.removeLiquidity(liquidity + 1n))
                .to.be.revertedWith("DEX: insufficient liquidity balance");
        });
    });
    
    describe("Token Swaps", function() {
        beforeEach(async function() {
            // Add initial liquidity before swap tests
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );
        });
        
        it("should swap token A for token B", async function() {
            const swapAmount = ethers.utils.parseEther("10");
            
            // Mint tokens to addr1
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, swapAmount);
            
            const balanceBBefore = await tokenB.balanceOf(addr1.address);
            
            await dex.connect(addr1).swapAForB(swapAmount);
            
            const balanceBAfter = await tokenB.balanceOf(addr1.address);
            expect(balanceBAfter).to.be.gt(balanceBBefore);
        });
        
        it("should swap token B for token A", async function() {
            const swapAmount = ethers.utils.parseEther("20");
            
            // Mint tokens to addr1
            await tokenB.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenB.connect(addr1).approve(dex.address, swapAmount);
            
            const balanceABefore = await tokenA.balanceOf(addr1.address);
            
            await dex.connect(addr1).swapBForA(swapAmount);
            
            const balanceAAfter = await tokenA.balanceOf(addr1.address);
            expect(balanceAAfter).to.be.gt(balanceABefore);
        });
        
        it("should calculate correct output amount with fee", async function() {
            const amountIn = ethers.utils.parseEther("10");
            const reserveA = ethers.utils.parseEther("100");
            const reserveB = ethers.utils.parseEther("200");
            
            const expectedOut = await dex.getAmountOut(amountIn, reserveA, reserveB);
            
            // Manual calculation: (10 * 997 * 200) / (100 * 1000 + 10 * 997)
            const amountInWithFee = amountIn.mul(997);
            const numerator = amountInWithFee.mul(reserveB);
            const denominator = reserveA.mul(1000).add(amountInWithFee);
            const manualCalc = numerator.div(denominator);
            
            expect(expectedOut).to.equal(manualCalc);
        });
        
        it("should update reserves after swap", async function() {
            const swapAmount = ethers.utils.parseEther("10");
            
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, swapAmount);
            
            const [reserveABefore, reserveBBefore] = await dex.getReserves();
            
            await dex.connect(addr1).swapAForB(swapAmount);
            
            const [reserveAAfter, reserveBAfter] = await dex.getReserves();
            
            expect(reserveAAfter).to.be.gt(reserveABefore);
            expect(reserveBAfter).to.be.lt(reserveBBefore);
        });
        
        it("should increase k after swap due to fees", async function() {
            const [reserveABefore, reserveBBefore] = await dex.getReserves();
            const kBefore = reserveABefore * reserveBBefore;
            
            const swapAmount = ethers.utils.parseEther("10");
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, swapAmount);
            
            await dex.connect(addr1).swapAForB(swapAmount);
            
            const [reserveAAfter, reserveBAfter] = await dex.getReserves();
            const kAfter = reserveAAfter * reserveBAfter;
            
            // k should increase due to 0.3% fee
            expect(kAfter).to.be.gt(kBefore);
        });
        
        it("should revert on zero swap amount", async function() {
            await expect(dex.swapAForB(0))
                .to.be.revertedWith("DEX: insufficient input amount");
            
            await expect(dex.swapBForA(0))
                .to.be.revertedWith("DEX: insufficient input amount");
        });
        
        it("should handle large swaps with high price impact", async function() {
            const largeSwap = ethers.utils.parseEther("50"); // 50% of pool
            
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, largeSwap);
            
            const balanceBBefore = await tokenB.balanceOf(addr1.address);
            await dex.connect(addr1).swapAForB(largeSwap);
            const balanceBAfter = await tokenB.balanceOf(addr1.address);
            
            const received = balanceBAfter.sub(balanceBBefore);
            expect(received).to.be.gt(0);
            expect(received).to.be.lt(ethers.utils.parseEther("100")); // Less than 50% of pool due to slippage
        });
        
        it("should handle multiple consecutive swaps", async function() {
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000"));
            
            for (let i = 0; i < 3; i++) {
                await dex.connect(addr1).swapAForB(ethers.utils.parseEther("5"));
            }
            
            const [reserveA, reserveB] = await dex.getReserves();
            expect(reserveA).to.be.gt(ethers.utils.parseEther("100"));
            expect(reserveB).to.be.lt(ethers.utils.parseEther("200"));
        });
    });
    
    describe("Price Calculations", function() {
        it("should return correct initial price", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const price = await dex.getPrice();
            // Price = reserveB / reserveA = 200 / 100 = 2 (scaled by 1e18)
            const expectedPrice = ethers.utils.parseEther("2");
            
            expect(price).to.equal(expectedPrice);
        });
        
        it("should update price after swaps", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const priceBefore = await dex.getPrice();
            
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("10"));
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
            
            const priceAfter = await dex.getPrice();
            
            // Price should decrease (A became more expensive relative to B)
            expect(priceAfter).to.be.lt(priceBefore);
        });
        
        it("should handle price queries with zero reserves gracefully", async function() {
            await expect(dex.getPrice())
                .to.be.revertedWith("DEX: no liquidity");
        });
    });
    
    describe("Fee Distribution", function() {
        it("should accumulate fees for liquidity providers", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const [reserveABefore, reserveBBefore] = await dex.getReserves();
            const kBefore = reserveABefore * reserveBBefore;
            
            // Perform swaps to accumulate fees
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("50"));
            
            for (let i = 0; i < 5; i++) {
                await dex.connect(addr1).swapAForB(ethers.utils.parseEther("5"));
            }
            
            const [reserveAAfter, reserveBAfter] = await dex.getReserves();
            const kAfter = reserveAAfter * reserveBAfter;
            
            // k should have increased due to accumulated fees
            expect(kAfter).to.be.gt(kBefore);
        });
        
        it("should distribute fees proportionally to LP share", async function() {
            // Owner adds liquidity
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            const ownerLiquidityBefore = await dex.liquidity(owner.address);
            
            // addr1 adds equal liquidity
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenB.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("100"));
            await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("200"));
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            // Perform swaps to generate fees
            await tokenA.mint(addr2.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr2).approve(dex.address, ethers.utils.parseEther("50"));
            await dex.connect(addr2).swapAForB(ethers.utils.parseEther("20"));
            
            // Remove liquidity and check proportional returns
            const ownerBalanceABefore = await tokenA.balanceOf(owner.address);
            
            await dex.removeLiquidity(ownerLiquidityBefore);
            
            const ownerBalanceAAfter = await tokenA.balanceOf(owner.address);
            
            const ownerReceivedA = ownerBalanceAAfter.sub(ownerBalanceABefore);
            
            // Owner should receive more than initial 100 ETH due to fees
            expect(ownerReceivedA).to.be.gt(ethers.utils.parseEther("100"));
        });
    });
    
    describe("Edge Cases", function() {
        it("should handle very small liquidity amounts", async function() {
            const smallAmount = ethers.utils.parseEther("0.001");
            
            await expect(dex.addLiquidity(smallAmount, smallAmount))
                .to.not.be.reverted;
        });
        
        it("should handle very large liquidity amounts", async function() {
            const largeAmount = ethers.utils.parseEther("100000");
            
            await tokenA.mint(owner.address, largeAmount);
            await tokenB.mint(owner.address, largeAmount);
            await tokenA.approve(dex.address, largeAmount);
            await tokenB.approve(dex.address, largeAmount);
            
            await expect(dex.addLiquidity(largeAmount, largeAmount))
                .to.not.be.reverted;
        });
        
        it("should prevent unauthorized access", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const ownerLiquidity = await dex.liquidity(owner.address);
            
            // addr1 should not be able to remove owner's liquidity
            await expect(dex.connect(addr1).removeLiquidity(ownerLiquidity))
                .to.be.revertedWith("DEX: insufficient liquidity balance");
        });
    });
    
    describe("Events", function() {
        it("should emit LiquidityAdded event", async function() {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");
            
            await expect(dex.addLiquidity(amountA, amountB))
                .to.emit(dex, "LiquidityAdded");
        });
        
        it("should emit LiquidityRemoved event", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const liquidityAmount = await dex.liquidity(owner.address);
            
            await expect(dex.removeLiquidity(liquidityAmount))
                .to.emit(dex, "LiquidityRemoved");
        });
        
        it("should emit Swap event", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            
            const swapAmount = ethers.utils.parseEther("10");
            await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
            await tokenA.connect(addr1).approve(dex.address, swapAmount);
            
            await expect(dex.connect(addr1).swapAForB(swapAmount))
                .to.emit(dex, "Swap")
                .withArgs(
                    addr1.address,
                    tokenA.address,
                    tokenB.address,
                    swapAmount,
                    await dex.getAmountOut(swapAmount, ethers.utils.parseEther("100"), ethers.utils.parseEther("200"))
                );
        });
    });
});

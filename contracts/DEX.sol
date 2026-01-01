// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DEX is ReentrancyGuard {
    // State variables
    address public tokenA;
    address public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;
    
    // Constants
    uint256 private constant FEE_NUMERATOR = 997;
    uint256 private constant FEE_DENOMINATOR = 1000;
    
    // Events - MUST emit these
    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityBurned);
    event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    
    /// @notice Initialize the DEX with two token addresses
    /// @param _tokenA Address of first token
    /// @param _tokenB Address of second token
    constructor(address _tokenA, address _tokenB) {
        require(_tokenA != address(0), "DEX: tokenA is zero address");
        require(_tokenB != address(0), "DEX: tokenB is zero address");
        require(_tokenA != _tokenB, "DEX: identical tokens");
        
        tokenA = _tokenA;
        tokenB = _tokenB;
    }
    
    /// @notice Add liquidity to the pool
    /// @param amountA Amount of token A to add
    /// @param amountB Amount of token B to add
    /// @return liquidityMinted Amount of LP tokens minted
    function addLiquidity(uint256 amountA, uint256 amountB) 
        external 
        nonReentrant
        returns (uint256 liquidityMinted) 
    {
        require(amountA > 0 && amountB > 0, "DEX: insufficient amounts");
        
        // Transfer tokens from user to contract
        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountA),
            "DEX: transferFrom tokenA failed"
        );
        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountB),
            "DEX: transferFrom tokenB failed"
        );
        
        // Calculate liquidity to mint
        if (totalLiquidity == 0) {
            // First liquidity provider
            liquidityMinted = sqrt(amountA * amountB);
            require(liquidityMinted > 0, "DEX: insufficient liquidity minted");
        } else {
            // Subsequent liquidity providers
            // Liquidity should be proportional to existing reserves
            uint256 liquidityA = (amountA * totalLiquidity) / reserveA;
            uint256 liquidityB = (amountB * totalLiquidity) / reserveB;
            liquidityMinted = liquidityA < liquidityB ? liquidityA : liquidityB;
            require(liquidityMinted > 0, "DEX: insufficient liquidity minted");
        }
        
        // Update state
        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        reserveA += amountA;
        reserveB += amountB;
        
        emit LiquidityAdded(msg.sender, amountA, amountB, liquidityMinted);
    }
    
    /// @notice Remove liquidity from the pool
    /// @param liquidityAmount Amount of LP tokens to burn
    /// @return amountA Amount of token A returned
    /// @return amountB Amount of token B returned
    function removeLiquidity(uint256 liquidityAmount) 
        external 
        nonReentrant
        returns (uint256 amountA, uint256 amountB) 
    {
        require(liquidityAmount > 0, "DEX: insufficient liquidity amount");
        require(liquidity[msg.sender] >= liquidityAmount, "DEX: insufficient liquidity balance");
        require(totalLiquidity > 0, "DEX: no liquidity");
        
        // Calculate amounts to return
        amountA = (liquidityAmount * reserveA) / totalLiquidity;
        amountB = (liquidityAmount * reserveB) / totalLiquidity;
        
        require(amountA > 0 && amountB > 0, "DEX: insufficient amounts");
        
        // Update state
        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        reserveA -= amountA;
        reserveB -= amountB;
        
        // Transfer tokens back to user
        require(
            IERC20(tokenA).transfer(msg.sender, amountA),
            "DEX: transfer tokenA failed"
        );
        require(
            IERC20(tokenB).transfer(msg.sender, amountB),
            "DEX: transfer tokenB failed"
        );
        
        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidityAmount);
    }
    
    /// @notice Swap token A for token B
    /// @param amountAIn Amount of token A to swap
    /// @return amountBOut Amount of token B received
    function swapAForB(uint256 amountAIn) 
        external 
        nonReentrant
        returns (uint256 amountBOut) 
    {
        require(amountAIn > 0, "DEX: insufficient input amount");
        require(reserveA > 0 && reserveB > 0, "DEX: insufficient liquidity");
        
        // Calculate output amount using constant product formula with fee
        amountBOut = getAmountOut(amountAIn, reserveA, reserveB);
        require(amountBOut > 0, "DEX: insufficient output amount");
        require(amountBOut < reserveB, "DEX: insufficient liquidity for swap");
        
        // Transfer token A from user to contract
        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn),
            "DEX: transferFrom tokenA failed"
        );
        
        // Update reserves
        reserveA += amountAIn;
        reserveB -= amountBOut;
        
        // Transfer token B to user
        require(
            IERC20(tokenB).transfer(msg.sender, amountBOut),
            "DEX: transfer tokenB failed"
        );
        
        emit Swap(msg.sender, tokenA, tokenB, amountAIn, amountBOut);
    }
    
    /// @notice Swap token B for token A
    /// @param amountBIn Amount of token B to swap
    /// @return amountAOut Amount of token A received
    function swapBForA(uint256 amountBIn) 
        external 
        nonReentrant
        returns (uint256 amountAOut) 
    {
        require(amountBIn > 0, "DEX: insufficient input amount");
        require(reserveA > 0 && reserveB > 0, "DEX: insufficient liquidity");
        
        // Calculate output amount using constant product formula with fee
        amountAOut = getAmountOut(amountBIn, reserveB, reserveA);
        require(amountAOut > 0, "DEX: insufficient output amount");
        require(amountAOut < reserveA, "DEX: insufficient liquidity for swap");
        
        // Transfer token B from user to contract
        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountBIn),
            "DEX: transferFrom tokenB failed"
        );
        
        // Update reserves
        reserveB += amountBIn;
        reserveA -= amountAOut;
        
        // Transfer token A to user
        require(
            IERC20(tokenA).transfer(msg.sender, amountAOut),
            "DEX: transfer tokenA failed"
        );
        
        emit Swap(msg.sender, tokenB, tokenA, amountBIn, amountAOut);
    }
    
    /// @notice Get current price of token A in terms of token B
    /// @return price Current price (reserveB / reserveA)
    function getPrice() external view returns (uint256 price) {
        require(reserveA > 0, "DEX: no liquidity");
        price = (reserveB * 1e18) / reserveA;
    }
    
    /// @notice Get current reserves
    /// @return _reserveA Current reserve of token A
    /// @return _reserveB Current reserve of token B
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        _reserveA = reserveA;
        _reserveB = reserveB;
    }
    
    /// @notice Calculate amount of token B received for given amount of token A
    /// @param amountIn Amount of input token
    /// @param reserveIn Reserve of input token
    /// @param reserveOut Reserve of output token
    /// @return amountOut Amount of output token (after 0.3% fee)
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public 
        pure 
        returns (uint256 amountOut) 
    {
        require(amountIn > 0, "DEX: insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "DEX: insufficient liquidity");
        
        // Apply 0.3% fee (multiply by 997/1000)
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;
        amountOut = numerator / denominator;
    }
    
    /// @notice Square root function for initial liquidity calculation
    /// @param y Input value
    /// @return z Square root of y
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

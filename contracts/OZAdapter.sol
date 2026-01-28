// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import {Mandelbrot} from "./Mandelbrot.sol";

contract OZAdapter is Mandelbrot {
    function $_transfer(address from, address to, uint256 value) external {
        _transfer(from, to, value);
    }

    function $_update(address from, address to, uint256 value) external {
        _update(from, to, value);
    }

    function $_approve(address owner, address spender, uint256 value) external {
        _approve(owner, spender, value);
    }
}
const express = require('express');
const router = express.Router();
const productService = require('../services/productService');

router.post('/', async (req, res) => {
    const product = await productService.addProduct(req.body);
    res.status(201).json(product); // 201 Created[cite: 6]
});

router.get('/', async (req, res) => {
    const products = await productService.listProducts();
    res.status(200).json(products);
});

module.exports = router;
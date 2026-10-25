const { z } = require('zod');
const productRepo = require('../repositories/productRepository');

// Enforcing Business Rules BR7 and BR8
const productSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    // BR7: Price must be strictly greater than zero
    price: z.number().positive("BR7 Violation: Price must be greater than zero"),
    // BR8: Must belong to a valid category
    category: z.enum(['Electronics', 'Clothing', 'Books'], {
        errorMap: () => ({ message: "BR8 Violation: Invalid category" })
    })
});

async function addProduct(data) {
    // This throws an error if rules are violated, caught by our global error handler
    const validatedData = productSchema.parse(data);
    return await productRepo.createProduct(validatedData);
}

async function listProducts() {
    return await productRepo.getAllProducts();
}

module.exports = { addProduct, listProducts };
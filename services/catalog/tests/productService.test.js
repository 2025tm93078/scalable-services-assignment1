const productService = require('../src/services/productService');
const productRepo = require('../src/repositories/productRepository');

// Mock the database repository so we only test the business logic
jest.mock('../src/repositories/productRepository');

describe('Catalog Business Rules Validation', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('BR7: Should reject product with price less than or equal to zero', async () => {
        const invalidProduct = { name: 'Freebie', price: 0, category: 'Electronics' };

        await expect(productService.addProduct(invalidProduct)).rejects.toThrow(/BR7/);
        expect(productRepo.createProduct).not.toHaveBeenCalled();
    });

    test('BR8: Should reject product with an invalid category', async () => {
        const invalidProduct = { name: 'Teddy Bear', price: 15, category: 'Toys' };

        await expect(productService.addProduct(invalidProduct)).rejects.toThrow(/BR8/);
        expect(productRepo.createProduct).not.toHaveBeenCalled();
    });

    test('Should successfully add a valid product', async () => {
        const validProduct = { name: 'Laptop', price: 999.99, category: 'Electronics' };
        productRepo.createProduct.mockResolvedValue({ id: 1, ...validProduct });

        const result = await productService.addProduct(validProduct);

        expect(result.id).toBe(1);
        expect(productRepo.createProduct).toHaveBeenCalledWith(validProduct);
    });
});
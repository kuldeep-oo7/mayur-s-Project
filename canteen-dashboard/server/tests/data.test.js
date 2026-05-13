import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';
import app from '../index.js';

describe('Data Management API', () => {
    let token;

    beforeAll(async () => {
        // Log in to get a valid token
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: process.env.DEFAULT_ADMIN_PASSWORD || 'changeMe123!' });
        token = res.body.token;
    });

    it('should fetch vendors list', async () => {
        const res = await request(app)
            .get('/api/vendors')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('should add and retrieve a purchase', async () => {
        const purchase = {
            date: '2026-05-01',
            supplierName: 'Test Vendor',
            item: 'Test Item',
            category: 'Grocery/Dry',
            quantity: 10,
            price: 50,
            total: 500,
            finalAmount: 500
        };

        const addRes = await request(app)
            .post('/api/purchases')
            .set('Authorization', `Bearer ${token}`)
            .send(purchase);
        
        expect(addRes.statusCode).toBe(200);
        const purchaseId = addRes.body.id;

        const getRes = await request(app)
            .get(`/api/purchases?month=2026-05`)
            .set('Authorization', `Bearer ${token}`);
        
        expect(getRes.statusCode).toBe(200);
        const found = getRes.body.find(p => p.id === purchaseId);
        expect(found).toBeDefined();
        expect(found.item).toBe('Test Item');
    });

    it('should block unauthorized access to data', async () => {
        const res = await request(app).get('/api/purchases');
        expect(res.statusCode).toBe(401);
    });
});

import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../index.js';

describe('Authentication API', () => {
    it('should fail login with wrong credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'admin',
                password: 'wrongpassword'
            });
        
        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('error');
    });

    it('should succeed login with correct credentials', async () => {
        // Default seeded admin password is changeMe123! (or from env)
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'admin',
                password: process.env.DEFAULT_ADMIN_PASSWORD || 'changeMe123!'
            });
        
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.username).toBe('admin');
    });

    it('should block access to protected routes without token', async () => {
        const res = await request(app).get('/api/users/me');
        expect(res.statusCode).toEqual(401);
    });
});

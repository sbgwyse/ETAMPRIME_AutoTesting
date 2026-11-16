import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { LoginPage } from '../pages/LoginPage';
 
dotenv.config();
 
const validUsername = process.env.ETAM_USERNAME;
const validPassword = process.env.ETAM_PASSWORD;
 
if (!validUsername || !validPassword) {
  throw new Error(
    'ETAM_USERNAME or ETAM_PASSWORD is missing from the .env file'
  );
}
 
test.describe('Login', () => {
 
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
  });
 
  test.describe('Validation errors', () => {
 
    test('shows an error when username is empty', async ({ page }) => {
      const loginPage = new LoginPage(page);
 
      await loginPage.fillUsername('');
      await loginPage.fillPassword(validPassword);
      await loginPage.submit();
 
      // Add validation assertion
    });
 
    test('shows an error when password is empty', async ({ page }) => {
      const loginPage = new LoginPage(page);
 
      await loginPage.fillUsername(validUsername);
      await loginPage.fillPassword('');
      await loginPage.submit();
 
      // Add validation assertion
    });
 
  });
 
  test.describe('Wrong credentials', () => {
 
    test('rejects an incorrect username', async ({ page }) => {
      const loginPage = new LoginPage(page);
 
      await loginPage.login(
        'wrong_username',
        validPassword
      );
 
      // Add error assertion
    });
 
  });
 
  test('successful login', async ({ page }) => {
    const loginPage = new LoginPage(page);
 
    await loginPage.login(
      validUsername,
      validPassword
    );
 
    // Add dashboard assertion
  });
 
});
 
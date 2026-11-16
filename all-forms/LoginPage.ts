import { type Page, type Locator, expect } from '@playwright/test';
 
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
 
  // TODO: replace with the real selector for the login error message.
  // Trigger a failed login manually, inspect the DOM (right-click > Inspect),
  // and swap this locator for the real one (e.g. a toast, a <div class="error">, etc.)
  readonly loginErrorMessage: Locator;
 
  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByRole('textbox', { name: 'Username' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.signInButton = page.getByRole('button', { name: 'Sign In' });
 
    // Placeholder — update once you inspect the real error UI
    this.loginErrorMessage = page.locator('.error, .toast-error, [role="alert"]').first();
  }
 
  async goto() {
    await this.page.goto('https://presence.tajhotels.com/etam_prime/login');
  }
 
  async fillUsername(value: string) {
    await this.usernameInput.fill(value);
  }
 
  async fillPassword(value: string) {
    await this.passwordInput.fill(value);
  }
 
  async submit() {
    await this.signInButton.click();
  }
 
  async login(username: string, password: string) {
    await this.fillUsername(username);
    await this.fillPassword(password);
    await this.submit();
  }
 
  /** After a successful login the app should navigate away from /login */
  async expectLoggedIn() {
    await expect(this.page).not.toHaveURL(/\/login/);
  }
 
  /**
   * Confirms the dashboard actually loaded after login — not just that the
   * URL changed. TODO: replace this locator with something real from the
   * dashboard, e.g. a welcome heading, sidebar item, or logo you can see
   * once logged in. Right-click that element > Inspect to find a good one.
   */
  async expectDashboardVisible() {
    await expect(this.page.locator('mat-sidenav-container')).toBeVisible();
  }
}

 
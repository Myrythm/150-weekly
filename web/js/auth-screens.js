/*
 * Weekly 150 web: the auth screens (login, register, check email, forgot, reset), shared by every page.
 * Loaded right before auth.js at the end of <body>; inserts #auth after #app. Static markup only:
 * every text from the server or the user is set later through textContent.
 */
(function () {
  'use strict';
  var MARKUP = `
<div class="auth" id="auth">
<header class="site-header auth-header">
  <div class="wrap header-inner">
    <span class="wordmark" id="auth-wordmark">Weekly<span>150</span></span>
  </div>
</header>
<main class="band auth-band" id="auth-main">
  <div class="wrap auth-grid">
    <div class="auth-intro">
      <p class="label">Race entry</p>
      <h1 class="h1" id="auth-heading">Bank 150 minutes a week.</h1>
      <p class="lead" id="auth-lead">Log in to pick up your log, plan and imports on any device. Only you can see them.</p>
    </div>
    <div class="panel auth-card">
      <div class="auth-strip label" aria-hidden="true"><span>Entry desk</span><span>Weekly 150</span></div>
      <div class="auth-body">
        <p class="small muted" id="auth-loading">Checking your entry.</p>
        <p class="auth-msg" id="auth-msg" role="status" aria-live="polite"></p>

        <section class="auth-screen" id="auth-login" aria-labelledby="auth-login-title" hidden>
          <h2 class="h3" id="auth-login-title" tabindex="-1">Log in</h2>
          <form class="form-stack" id="login-form" novalidate>
            <div class="field">
              <label class="label" for="login-username">Username</label>
              <input class="input" id="login-username" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" aria-describedby="login-username-err">
              <p class="error" id="login-username-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="login-password">Password</label>
              <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" aria-describedby="login-password-err">
              <p class="error" id="login-password-err" hidden></p>
            </div>
            <button class="btn btn-accent btn-block" id="login-submit" type="submit">Log in</button>
            <button class="btn btn-outline btn-block" id="resend-verification" type="button" hidden>Resend verification email</button>
          </form>
          <div class="auth-links">
            <button class="btn-text" id="to-forgot" type="button">Forgot password?</button>
            <button class="btn-text" id="to-register" type="button">Create an account</button>
          </div>
        </section>

        <section class="auth-screen" id="auth-register" aria-labelledby="auth-register-title" hidden>
          <h2 class="h3" id="auth-register-title" tabindex="-1">Create an account</h2>
          <form class="form-stack" id="register-form" novalidate>
            <div class="field">
              <label class="label" for="reg-username">Username</label>
              <input class="input" id="reg-username" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" aria-describedby="reg-username-help reg-username-err">
              <p class="small muted" id="reg-username-help">3 to 20 lowercase letters, numbers or underscores. You log in with it, and it cannot be changed later.</p>
              <p class="error" id="reg-username-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="reg-display">Display name</label>
              <input class="input" id="reg-display" name="display_name" type="text" autocomplete="nickname" maxlength="60" aria-describedby="reg-display-help reg-display-err">
              <p class="small muted" id="reg-display-help">Printed on your race bib. Up to 40 characters.</p>
              <p class="error" id="reg-display-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="reg-email">Email</label>
              <input class="input" id="reg-email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" aria-describedby="reg-email-help reg-email-err">
              <p class="small muted" id="reg-email-help">Only used to verify your account and reset your password.</p>
              <p class="error" id="reg-email-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="reg-age">Age in years</label>
              <input class="input age-input" id="reg-age" name="age" type="number" inputmode="numeric" min="0" max="120" step="1" autocomplete="off" aria-describedby="reg-age-help reg-age-err">
              <p class="small muted" id="reg-age-help">Sets which WHO targets you see. You can change it later.</p>
              <p class="error" id="reg-age-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="reg-password">Password</label>
              <input class="input" id="reg-password" name="password" type="password" autocomplete="new-password" aria-describedby="reg-password-help reg-password-err">
              <p class="small muted" id="reg-password-help">At least 8 characters.</p>
              <p class="error" id="reg-password-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="reg-password2">Verify password</label>
              <input class="input" id="reg-password2" name="password2" type="password" autocomplete="new-password" aria-describedby="reg-password2-err">
              <p class="error" id="reg-password2-err" hidden></p>
            </div>
            <button class="btn btn-accent btn-block" id="reg-submit" type="submit">Create account</button>
          </form>
          <div class="auth-links">
            <button class="btn-text" id="to-login" type="button">I have an account. Log in</button>
          </div>
        </section>

        <section class="auth-screen" id="auth-check-email" aria-labelledby="auth-check-title" hidden>
          <h2 class="h3" id="auth-check-title" tabindex="-1">Check your email</h2>
          <p id="auth-check-text">Check your email to verify your account, then log in.</p>
          <p class="small muted" id="auth-check-help">No email after a few minutes? Look in your spam folder, or log in and ask for a new one.</p>
          <button class="btn btn-accent btn-block" id="check-to-login" type="button">Go to log in</button>
        </section>

        <section class="auth-screen" id="auth-forgot" aria-labelledby="auth-forgot-title" hidden>
          <h2 class="h3" id="auth-forgot-title" tabindex="-1">Reset your password</h2>
          <form class="form-stack" id="forgot-form" novalidate>
            <p class="small muted" id="forgot-help">Enter your username or the email you signed up with. We send a link to set a new password.</p>
            <div class="field">
              <label class="label" for="forgot-identifier">Username or email</label>
              <input class="input" id="forgot-identifier" name="identifier" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="forgot-help forgot-identifier-err">
              <p class="error" id="forgot-identifier-err" hidden></p>
            </div>
            <button class="btn btn-accent btn-block" id="forgot-submit" type="submit">Send reset link</button>
            <button class="btn btn-outline btn-block" id="forgot-resend" type="button">Send a new verification email</button>
          </form>
          <div class="auth-links">
            <button class="btn-text" id="forgot-to-login" type="button">Back to log in</button>
          </div>
        </section>

        <section class="auth-screen" id="auth-reset" aria-labelledby="auth-reset-title" hidden>
          <h2 class="h3" id="auth-reset-title" tabindex="-1">Set a new password</h2>
          <form class="form-stack" id="reset-form" novalidate>
            <div class="field">
              <label class="label" for="reset-password">New password</label>
              <input class="input" id="reset-password" name="password" type="password" autocomplete="new-password" aria-describedby="reset-password-help reset-password-err">
              <p class="small muted" id="reset-password-help">At least 8 characters.</p>
              <p class="error" id="reset-password-err" hidden></p>
            </div>
            <div class="field">
              <label class="label" for="reset-password2">Verify new password</label>
              <input class="input" id="reset-password2" name="password2" type="password" autocomplete="new-password" aria-describedby="reset-password2-err">
              <p class="error" id="reset-password2-err" hidden></p>
            </div>
            <button class="btn btn-accent btn-block" id="reset-submit" type="submit">Save new password</button>
          </form>
        </section>
      </div>
    </div>
  </div>
</main>
</div>
`;
  document.getElementById('app').insertAdjacentHTML('afterend', MARKUP);
})();

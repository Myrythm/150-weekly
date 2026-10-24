/*
 * Every auth text, verbatim from the COPY object of web/js/auth.js, plus the form rules that
 * go with it (username and email patterns, register validation).
 */
export const COPY = {
  wrong: 'Wrong username or password.',
  unverified: 'Email not verified yet.',
  recovery: 'If that account exists, we sent an email.',
  rate: 'Too many attempts. Try again in a few minutes.',
  expired: 'This link has expired or was already used. Request a new one.',
  verified: 'Email verified. You can log in now.',
  checkEmail: 'Check your email to verify your account, then log in.',
  ended: 'Your session ended. Log in again to keep saving.',
  taken: 'Username taken.',
  offline: 'Could not reach the server. Check your connection and try again.',
  failed: 'Something went wrong. Try again.',
  loadFailed: 'Could not load your log. Check your connection and log in again.',
  usernameFormat: 'Use 3 to 20 lowercase letters, numbers or underscores.',
  displayFormat: 'Enter a display name of 1 to 40 characters.',
  emailFormat: 'Enter a valid email address.',
  ageFormat: 'Enter your age as a whole number from 0 to 120.',
  passwordShort: 'Use at least 8 characters.',
  passwordMatch: 'The passwords do not match.',
  passwordSame: 'Choose a password that differs from your current one.',
  passwordWeak: 'Choose a stronger password.',
  passwordSaved: 'New password saved.',
  needUsername: 'Enter your username.',
  needPassword: 'Enter your password.',
  needIdentifier: 'Enter your username or email.',
  notConfigured: 'This page could not start. Try again later.'
};

/* the beforeunload warning while a write is still queued */
export const SAVING = 'Your last change is still saving.';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const REG_FIELDS = ['reg-username', 'reg-display', 'reg-email', 'reg-age', 'reg-password', 'reg-password2'];

/* usernames and emails are both compared in lower case */
export function norm(s) { return String(s || '').trim().toLowerCase(); }

/*
 * validateRegister({ username, displayName, email, age, password, password2 }, takenName)
 *   -> { values, errors: { [fieldId]: text }, first: fieldId | null }
 * takenName is the last username the server reported taken.
 */
export function validateRegister(fields, takenName) {
  fields = fields || {};
  const v = {
    username: norm(fields.username),
    displayName: String(fields.displayName || '').trim(),
    email: String(fields.email || '').trim(),
    ageRaw: String(fields.age === undefined || fields.age === null ? '' : fields.age).trim(),
    password: String(fields.password || ''),
    password2: String(fields.password2 || '')
  };
  const errors = {};
  if (!USERNAME_RE.test(v.username)) errors['reg-username'] = COPY.usernameFormat;
  else if (takenName === v.username) errors['reg-username'] = COPY.taken;
  if (v.displayName.length < 1 || v.displayName.length > 40) errors['reg-display'] = COPY.displayFormat;
  if (!EMAIL_RE.test(v.email)) errors['reg-email'] = COPY.emailFormat;
  v.age = /^\d{1,3}$/.test(v.ageRaw) ? Number(v.ageRaw) : NaN;
  if (!(v.age >= 0 && v.age <= 120)) errors['reg-age'] = COPY.ageFormat;
  if (v.password.length < 8) errors['reg-password'] = COPY.passwordShort;
  if (v.password2 !== v.password) errors['reg-password2'] = COPY.passwordMatch;
  const first = REG_FIELDS.filter(function (id) { return errors[id]; })[0] || null;
  return { values: v, errors: errors, first: first };
}

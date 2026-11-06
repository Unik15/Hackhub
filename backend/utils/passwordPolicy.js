export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS =
  "Use at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a special character.";

export function getPasswordStrengthError(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return "Password must be at least 8 characters.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }

  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one special character.";
  }

  return null;
}

export function isStrongPassword(password) {
  return getPasswordStrengthError(password) === null;
}

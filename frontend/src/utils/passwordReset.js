export const MIN_PASSWORD_LENGTH = 8;

export function passwordsMatch(password, confirmPassword) {
  return (
    typeof password === "string" &&
    typeof confirmPassword === "string" &&
    password.length > 0 &&
    password === confirmPassword
  );
}

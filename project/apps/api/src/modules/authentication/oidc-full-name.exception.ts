import { UnauthorizedException } from "@nestjs/common";

// Only this safe, actionable provider-policy error may pass through the bearer guard.
export class OidcFullNameTooLongException extends UnauthorizedException {
  constructor() {
    super(
      "Your identity provider full name exceeds 50 characters. Shorten your full name in your identity provider profile to 50 characters or fewer, then sign in again.",
    );
  }
}

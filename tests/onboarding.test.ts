import assert from "node:assert/strict";
import test from "node:test";
import {
  onboardingPreferencesFromMetadata,
  onboardingRoleDetails,
  validateOnboardingPreferences,
} from "../lib/onboarding.ts";

test("onboarding preferences use safe defaults and derive a readable name", () => {
  assert.deepEqual(onboardingPreferencesFromMetadata({}, "fran.gonzalez@example.com"), {
    displayName: "fran gonzalez",
    language: "es",
    timezone: "Europe/Madrid",
    operationalEmailNotifications: true,
  });
});

test("onboarding preferences restore supported user metadata", () => {
  assert.deepEqual(onboardingPreferencesFromMetadata({
    display_name: "Fran González",
    locale: "fr",
    timezone: "Europe/Paris",
    operational_email_notifications: false,
  }, "fran@example.com"), {
    displayName: "Fran González",
    language: "fr",
    timezone: "Europe/Paris",
    operationalEmailNotifications: false,
  });
});

test("onboarding validation normalizes names and rejects unsupported choices", () => {
  assert.deepEqual(validateOnboardingPreferences({
    displayName: "  Fran   González  ",
    language: "es",
    timezone: "Europe/Madrid",
    operationalEmailNotifications: true,
  }), {
    ok: true,
    data: {
      displayName: "Fran González",
      language: "es",
      timezone: "Europe/Madrid",
      operationalEmailNotifications: true,
    },
  });
  assert.equal(validateOnboardingPreferences({
    displayName: "F",
    language: "es",
    timezone: "Europe/Madrid",
    operationalEmailNotifications: true,
  }).ok, false);
  assert.equal(validateOnboardingPreferences({
    displayName: "Fran",
    language: "de",
    timezone: "Europe/Madrid",
    operationalEmailNotifications: true,
  }).ok, false);
});

test("known and unknown roles have useful onboarding copy", () => {
  assert.equal(onboardingRoleDetails("OWNER").label, "Propietario");
  assert.equal(onboardingRoleDetails("OPERATOR").capabilities.length, 3);
  assert.equal(onboardingRoleDetails("CUSTOM").label, "CUSTOM");
});

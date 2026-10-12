# Scoped dependency security overrides

The application keeps its existing Next and Firebase SDK major versions while two affected transitive dependencies are patched:

- Next's PostCSS is scoped to 8.5.29. This fixes style-context escaping and untrusted source-map loading within the existing PostCSS 8 family. Remove the override only after the selected Next release supplies a patched dependency and the CSS/security/browser checks pass.
- Firebase Firestore's Node gRPC client is scoped to 1.14.6 within gRPC major 1. The version fixes optional client-certificate authentication context and accidental thrown-handler-message disclosure. The application is a Firestore client, not an exposed gRPC server; the regression test exercises the advisory's certificate-provider configuration on loopback.

Unused patch-package was removed: the repository has no patches directory, postinstall hook or source/script invocation. This does not certify remaining development-tool brace parsers as safe.

`tests/dependency-security.test.ts` checks ordinary CSS compatibility, HTML style-context escaping, source-map file isolation, trusted/untrusted optional client certificates and thrown-handler-message sanitization. Its certificates and files are disposable synthetic fixtures. Full `npm run verify` and authenticated emulator acceptance remain release gates; no production exploit or payment is performed.

Remaining production high package aggregates belong to the coupled Genkit/OpenTelemetry family. They trace to opt-in Prometheus exporter and Jaeger propagator advisories; neither activation was found in inspected NAL source/runtime settings. Latest Genkit still constrains the old telemetry family. Do not force individual OpenTelemetry majors or downgrade SDKs using npm audit fix --force. A coherent telemetry migration needs separate compatibility checks for startup, tracing/logging, Analyzer and financial/historical extraction. Moderate and development/build advisories also remain open; the critical-only audit gate is not a clean-security certificate.

These dependency changes do not change roles, financial terms, approval policy, bank reconciliation behavior or signing requirements.

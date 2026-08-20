# Building and Validating the Zorro Feature with AI Assistance

## Direct answer

**Yes, you can Vibe Code a credible prototype of this feature with AI assistance.** You can build the user interface, data model, deterministic preflight checks, mock setup actions, run-state classification, resource tracking, teardown, and a polished demonstration. You do not need access to Zorro’s private infrastructure to demonstrate the product concept.

However, you should not represent an AI-coded prototype as a production-ready Zorro integration. A real production version would require decisions you cannot safely infer from public material: authentication architecture, private-network access, tenant isolation, secrets management, execution sandboxing, concurrency, retries, observability, retention, and integration with Zorro’s existing run engine. Those are the parts that require review by their engineers.

The correct portfolio claim is:

> “I built a prototype of a preflight and environment-bootstrap workflow for cloud E2E testing. It uses mock services and demonstrates how setup failures could be separated from product regressions.”

Do **not** claim:

> “I built a missing Zorro feature,” or “Zorro definitely needs this.”

The public Zorro documentation already covers run-code, variables, modules, teardown modules, triggers, test data, autohealing, and debugging. Your prototype should demonstrate the **orchestration layer that connects these primitives**, not pretend that the primitives do not exist.[1] [2] [3]

## Should you email the founder first?

**Yes. Email him before investing heavily or presenting the idea as a confirmed need.** Your first message should be a validation request, not a sales pitch and not a declaration that you solved a problem he has.

A good first email says, in effect: “I researched the public product, noticed a possible gap, built or am building a small prototype, and would like to know whether this problem exists for your customers.” This gives him an easy way to correct your assumption. It also demonstrates product judgment: you are asking whether the problem is real before forcing a solution on the company.

I would not begin with “I don’t need credits” or “unpaid is also good.” That can make you sound uncertain about your value and distract from the technical work. First establish that the problem matters. If he responds positively, then say you are interested in contributing as an intern or on a short trial project and are flexible about the structure. Whether unpaid work is appropriate depends on the applicable employment rules and the company’s policy, so do not promise a particular arrangement without discussing it.

## Recommended first email

**Subject:** Question about a possible Zorro testing workflow

> Hi Suchit,
>
> I’m a second-year student interested in an internship with Narrative/Zorro. I reviewed Zorro’s public product pages and documentation and noticed that you already expose useful building blocks such as run-code steps, variables, reusable modules, teardown modules, and scheduled or CI-triggered runs.
>
> I had one hypothesis I wanted to validate before building too far: could a preflight and environment-bootstrap workflow be useful for Zorro users? The idea would be to check environment health, authentication, required test data, and feature flags before a suite runs; run only approved setup actions when something is missing; distinguish environment/setup failures from product regressions; and track cleanup afterward.
>
> I have started a small prototype using mock services, not Zorro systems. I’m not assuming this is missing from your private roadmap, so I wanted to ask first: is this a real problem for your customers, or is it already handled internally? If it is relevant, I’d be happy to share the GitHub repository and a short demo. I’m especially interested in learning whether the harder part is test-account provisioning, private staging access, seed-data lifecycle, cleanup, or failure classification.
>
> If the problem is relevant, I would also be very interested in discussing an internship or short contribution project. I’m flexible about the structure and mainly want the opportunity to contribute useful work and learn from the team.
>
> Best,
> [Your name]
> [GitHub]
> [LinkedIn]
>
## If you have not built it yet

Do not say “I made this feature.” Say:

> “I’m prototyping a possible workflow and would value your feedback before I build further.”

If you have built a working mock prototype, say:

> “I built a standalone prototype using mock services. It is not connected to Zorro, and I would like to know whether the underlying problem is relevant before I suggest any integration.”

If he asks for the link, make sure the repository contains a clear README, a short demo video or GIF, setup instructions, test commands, a limitations section, and screenshots of the important states. A repository without explanation will make an AI-generated project look unfinished.

# Proper staged prompt chain for an AI coding IDE

Use these prompts one at a time. Do not paste the entire chain into the IDE at once. After every prompt, run the tests, inspect the diff, and correct errors before continuing. Replace framework-specific wording only after the IDE has inspected the repository. If you have not started a repository, begin with Prompt 0.

## Prompt 0 — Create the project safely

> Create a new portfolio prototype called `environment-readiness-prototype`. Before writing code, choose a simple, maintainable stack that you can run locally without paid services. Prefer the project’s default web stack if one already exists. The prototype must use mock services and must not connect to Zorro, Try Narrative, production systems, private customer systems, or real credentials.
>
> Create a minimal application shell, a README, a `.env.example`, a test command, and a clear `LIMITATIONS.md`. Do not add an LLM API, arbitrary shell execution, browser automation, credential scraping, or external integrations. First show me the proposed file structure and implementation plan. Wait for approval before implementing the main feature.

## Prompt 1 — Inspect and document the repository

> Inspect the repository and report the existing framework, package manager, entry points, scripts, database or storage layer, test setup, and development commands. Do not assume a library or function exists; verify it in the installed project files or current official documentation. Create `PRODUCT_SCOPE.md` containing: user problem, target user, MVP boundaries, non-goals, assumptions, and open questions for Try Narrative. Do not modify unrelated files.

## Prompt 2 — Define the domain model

> Implement the domain model using the repository’s existing conventions. Define schemas or types for `EnvironmentProfile`, `CheckDefinition`, `CheckResult`, `SetupAction`, `ResourceRecord`, `TeardownAction`, `Run`, and `RunEvent`.
>
> Add an explicit state machine with these states: `PENDING`, `PREFLIGHT_RUNNING`, `BLOCKED`, `BOOTSTRAPPING`, `READY`, `TEST_RUNNING`, `TEST_FAILED`, `ENVIRONMENT_FAILED`, `CLEANING_UP`, `COMPLETED`, and `CLEANUP_FAILED`.
>
> Illegal state transitions must be rejected. Add unit tests for valid transitions, invalid transitions, repeated cleanup, and partial setup. Do not add network calls yet.

## Prompt 3 — Build deterministic mock services

> Add a local mock environment service for the demo. It must expose deterministic endpoints for health, authentication status, feature flags, required-record lookup, record creation, and record deletion.
>
> Add fixtures for these scenarios: healthy environment; blocked environment; missing prerequisite record; successful setup; partial setup; and cleanup failure. Keep mock services isolated from application code. Add tests proving each scenario is repeatable. Document how to start the mock service.

## Prompt 4 — Implement preflight checks

> Implement a preflight runner against only the local mock service. Each check must have a stable ID, purpose, status, evidence, timestamp, timeout, and remediation text. Use statuses `PASS`, `WARN`, `BLOCK`, and `ERROR`.
>
> The runner must check URL reachability, authentication status, service health, required record existence, and feature-flag configuration. It must distinguish a blocked environment from a product-test failure. Do not allow an AI-generated explanation to decide pass/fail; decisions must be based on deterministic responses. Do not log secrets, authorization headers, or full tokens.

## Prompt 5 — Add environment profiles

> Build CRUD behavior for environment profiles using the existing storage conventions. A profile must contain a safe display name, an allowlisted mock base URL, check definitions, approved setup actions, teardown actions, timeout limits, and retry limits.
>
> Reject unknown URLs, missing required fields, excessive timeouts, unbounded retries, and setup actions that are not explicitly approved. Never store plaintext credentials. Add validation tests and useful error messages.

## Prompt 6 — Implement approved setup actions

> Add a bootstrap executor that supports only two safe demo action types: a mock API request and a reusable local module. Validate every action before execution. Enforce timeouts and bounded retries. Record action status, response category, timestamps, and created resource IDs.
>
> Do not support arbitrary shell commands, arbitrary JavaScript execution, command substitution, credential discovery, production URLs, or unrestricted outbound requests. Add tests for success, rejection, timeout, duplicate execution, and partial setup.

## Prompt 7 — Add the resource ledger and teardown

> Implement a run-scoped resource ledger. Every created mock resource must record resource type, opaque ID, creating action, creation time, teardown action, teardown status, and error details. Do not store secrets or sensitive payloads.
>
> Teardown must be idempotent and must run after successful tests, failed tests, partial bootstrap, and cancellation where supported. Add tests proving that partial setup does not leave mock resources behind. If teardown fails, classify the run as `CLEANUP_FAILED` and show the exact resource requiring attention.

## Prompt 8 — Implement run orchestration

> Implement the complete lifecycle: load profile; run preflight; stop with `BLOCKED` if required checks fail; request explicit approval before bootstrap; execute approved setup; rerun relevant checks; run a simulated product test; execute teardown; and generate the final classification.
>
> Use this precedence: `ENVIRONMENT_FAILED` when required preconditions fail; `TEST_FAILED` when preconditions pass and the product test fails; `CLEANUP_FAILED` when the main run completes but cleanup fails; and `COMPLETED` only when required checks, test execution, and cleanup all succeed. Add integration tests for all six demo scenarios.

## Prompt 9 — Build the operator interface

> Build a clear operator interface with these screens or sections: environment profile selection; preflight progress; check-result matrix; explicit bootstrap approval; run timeline; resource ledger; teardown status; and final report.
>
> Make environment failure visually distinct from product regression. Include loading, empty, timeout, retry, partial-failure, and cancellation states. Do not hide important errors in toast notifications. Ensure keyboard accessibility, readable contrast, and responsive layout. Reuse existing project components and styling conventions rather than adding unnecessary dependencies.

## Prompt 10 — Add controlled remediation guidance

> Add a remediation panel that maps deterministic failure codes to prewritten explanations and next steps. It may suggest actions, but it must not execute actions, mutate environment profiles, mark checks as passed, or bypass approval.
>
> Each suggestion must show the exact failed check and evidence that caused it. If the project has no approved LLM integration, do not add one. Use deterministic mappings for this prototype.

## Prompt 11 — Security and reliability review

> Review the implementation for SSRF, unsafe URL handling, secret leakage, arbitrary command execution, missing timeouts, unbounded retries, duplicate setup, race conditions, insecure logs, and cleanup failures.
>
> Add URL allowlisting for the mock service, input validation, redaction, bounded retries, cancellation handling, and structured events. Create `SECURITY_REVIEW.md` describing protections, remaining risks, and why this prototype is not production-ready. Do not claim that the prototype is secure for real customer environments.

## Prompt 12 — Make the repository internship-ready

> Prepare the project for a five-minute technical demonstration. Add seeded demo data, a concise README, setup instructions, test commands, screenshots or a short local demo script, an architecture diagram, a limitations section, and a product rationale.
>
> The README must explicitly state that this is a standalone prototype using mock services, is not connected to Zorro or Try Narrative, and demonstrates an environment-readiness concept. Include a comparison table showing documented Zorro primitives—run-code, variables, modules, teardown, triggers—and the additional orchestration layer demonstrated by this prototype. Do not invent performance numbers, customer results, or claims that Zorro lacks the feature.

## Prompt 13 — Final code review

> Act as a senior reviewer. Inspect the full diff, run all tests, and identify bugs, unsupported assumptions, security issues, weak error handling, accessibility problems, and misleading product claims. Fix only issues supported by the repository and current installed dependencies. Do not invent APIs or library methods. Produce `FINAL_REVIEW.md` with: completed functionality, test results, known limitations, manual demo steps, and questions to validate with Try Narrative.

## Final recommendation

Build the prototype far enough to demonstrate the workflow, but **email the founder before spending weeks polishing it**. Your first objective is not to prove that you found a missing feature. Your first objective is to discover whether environment setup, test-account provisioning, private staging access, data seeding, cleanup, or failure classification is actually painful for Zorro’s users.

If he confirms the problem, share the repository and ask which part matters most. If he says the capability already exists, ask what remains difficult and adapt the prototype. That response will demonstrate stronger product thinking than insisting that your original feature is new.

## References

[1]: https://zorrotest.com/docs/llms.txt "Zorro official documentation index"
[2]: https://zorrotest.com/docs/author-tests/untitled-page-6.md "Zorro official run-code documentation"
[3]: https://zorrotest.com/docs/author-tests/untitled-page-3 "Zorro official modules and teardown documentation"
[4]: https://zorrotest.com/docs/run-triggers.md "Zorro official triggers documentation"
[5]: https://zorrotest.com/docs/debugging.md "Zorro official debugging documentation"
[6]: https://zorrotest.com/docs/configuration/settings.md "Zorro official settings documentation"

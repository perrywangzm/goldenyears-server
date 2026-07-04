import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Stage = "schema" | "backend" | "frontend" | "docs" | "tests";
type CheckStatus = "pass" | "fail";

export type CheckResult = {
	status: CheckStatus;
	details: string;
};

export type ContractCheck = {
	id: string;
	stage: Stage;
	description: string;
	run: () => CheckResult;
};

export type SourceReader = {
	read(relativePath: string): string;
	readDirectory(relativePath: string): string;
	migrationFiles(): string[];
};

const stages: Stage[] = ["schema", "backend", "frontend", "docs", "tests"];
const currentFile = fileURLToPath(import.meta.url);
const serverRoot = path.resolve(path.dirname(currentFile), "../..");
const repoRoot = path.resolve(serverRoot, "..");

export const backendScenarioContracts: Record<string, string[]> = {
	"golden-years-server-next/src/platform/auth/createSupabaseAuthAdapter.bdd.test.ts":
		[
			"supabase-contract:missing-config-fails-closed",
			"supabase-contract:test-adapter-requires-explicit-injection",
		],
	"golden-years-server-next/src/platform/auth/httpSupabaseAuthAdapter.bdd.test.ts":
		[
			"supabase-contract:password-login-revokes-provider-session",
			"supabase-contract:recovery-verifies-before-password-update",
			"supabase-contract:auth-errors-map-by-operation",
			"supabase-contract:rate-limit-preserves-retryable-error",
		],
	"golden-years-server-next/src/application/auth/identityProvisioningService.bdd.test.ts":
		[
			"supabase-contract:auth-user-id-match-wins",
			"supabase-contract:verified-email-migration-link",
			"supabase-contract:unverified-email-link-rejected",
			"supabase-contract:different-auth-user-id-conflicts",
		],
	"golden-years-server-next/src/interface/routes/auth.route.bdd.test.ts": [
		"supabase-contract:signup-does-not-link-unverified-profile",
		"supabase-contract:recovery-ack-does-not-enumerate-account",
		"supabase-contract:resend-ack-does-not-enumerate-account",
	],
	"golden-years-server-next/src/application/auth/sessionService.bdd.test.ts": [
		"supabase-contract:provider-identity-creates-app-session",
		"supabase-contract:disabled-app-user-rejected",
		"supabase-contract:user-login-sets-session-and-csrf-cookies",
	],
	"golden-years-server-next/src/interface/routes/partner.bdd.test.ts": [
		"supabase-contract:partner-membership-after-provider-identity",
		"supabase-contract:audience-cookies-remain-isolated",
	],
	"golden-years-server-next/src/interface/routes/assessment.bdd.test.ts": [
		"supabase-contract:user-login-claims-anonymous-assessment",
	],
};

export const frontendScenarioContracts: Record<string, string[]> = {
	"golden-years-client-next/src/api/api-contracts.test.ts": [
		"supabase-contract:canonical-auth-route-inventory",
		"supabase-contract:credentials-include-on-auth",
		"supabase-contract:csrf-on-every-user-mutation",
	],
	"golden-years-client-next/src/features/auth/useAuthViewModel.test.tsx": [
		"supabase-contract:login-refreshes-current-user",
		"supabase-contract:logout-clears-current-user",
		"supabase-contract:signup-shows-verification-notice",
		"supabase-contract:password-recovery-workflow",
	],
};

export const canonicalFrontendAuthPaths = [
	"/api/v1/user/auth/login",
	"/api/v1/user/auth/logout",
	"/api/v1/user/auth/signup",
	"/api/v1/user/auth/confirm_verification",
	"/api/v1/user/auth/request_password_reset",
	"/api/v1/user/auth/confirm_password_reset",
	"/api/v1/user/auth/resend_verification",
] as const;

export const userMutationPaths = [
	"/api/v1/user/auth/logout",
	"/create_saved_facility",
	"/create_tour_request",
	"/create_assessment_result",
	"/delete_latest_assessment_result",
] as const;

export function buildChecks(
	reader: SourceReader = createFileReader(repoRoot),
): ContractCheck[] {
	return [
		{
			id: "schema.auth-user-link",
			stage: "schema",
			description:
				"users keeps its app ID and adds a unique Supabase auth UUID link.",
			run: () => {
				const core = reader.read(
					"golden-years-server-next/src/db/migrations/0001_core.sql",
				);
				const migrations = reader
					.migrationFiles()
					.map((file) => reader.read(file))
					.join("\n");
				const pass =
					/create table if not exists users[\s\S]*id text primary key/i.test(
						core,
					) &&
					/auth_user_id\s+uuid/i.test(migrations) &&
					/auth_user_id[\s\S]{0,180}unique|unique[\s\S]{0,180}auth_user_id/i.test(
						migrations,
					);
				return result(
					pass,
					"App user IDs remain primary and auth_user_id is a unique UUID link.",
					"Expected users.id text primary key plus a unique auth_user_id UUID migration.",
				);
			},
		},
		{
			id: "schema.password-hash-transition",
			stage: "schema",
			description: "legacy password_hash is nullable during the transition.",
			run: () => {
				const migrations = reader
					.migrationFiles()
					.map((file) => reader.read(file))
					.join("\n");
				const types = reader.read(
					"golden-years-server-next/src/db/schema/types.ts",
				);
				return result(
					/alter table users[\s\S]*alter column password_hash[\s\S]*drop not null/i.test(
						migrations,
					) && /password_hash\??:\s*string\s*\|\s*null/i.test(types),
					"password_hash is nullable in SQL and Kysely types.",
					"Expected nullable password_hash in the migration and schema type.",
				);
			},
		},
		{
			id: "schema.repository-identity-operations",
			stage: "schema",
			description:
				"the user repository has exact auth identity lookup and linking operations.",
			run: () => {
				const ports = reader.read(
					"golden-years-server-next/src/db/repositories/ports.ts",
				);
				const kysely = reader.read(
					"golden-years-server-next/src/db/repositories/kyselyRepositories.ts",
				);
				const required = [
					"findByAuthUserId",
					"linkAuthUserId",
					"createFromAuthIdentity",
				];
				return result(
					containsAll(ports, required) && containsAll(kysely, required),
					"Repository port and Kysely implementation expose the identity operations.",
					`Expected these operations in both repository port and Kysely implementation: ${required.join(", ")}.`,
				);
			},
		},
		{
			id: "backend.current-key-model",
			stage: "backend",
			description:
				"end-user Auth calls use the current publishable-key model, not a legacy service-role key.",
			run: () => {
				const env = reader.read("golden-years-server-next/src/config/env.ts");
				const adapter = reader.read(
					"golden-years-server-next/src/platform/auth/httpSupabaseAuthAdapter.ts",
				);
				return result(
					containsAll(env, ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]) &&
						containsAll(adapter, [
							"SUPABASE_URL",
							"SUPABASE_PUBLISHABLE_KEY",
						]) &&
						!/SUPABASE_SERVICE_ROLE_KEY/.test(`${env}\n${adapter}`),
					"Worker Auth uses SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
					"Expected ordinary Auth calls to use SUPABASE_PUBLISHABLE_KEY; reserve secret/admin keys for explicit offline admin tooling.",
				);
			},
		},
		{
			id: "backend.missing-config-fails-closed",
			stage: "backend",
			description:
				"missing Supabase bindings cannot silently enable legacy password authentication.",
			run: () => {
				const factory = reader.read(
					"golden-years-server-next/src/platform/auth/createSupabaseAuthAdapter.ts",
				);
				return result(
					productionFactoryFailsClosed(factory),
					"Production adapter construction fails closed and has no dev-password fallback.",
					"Remove the DevSupabaseAuthAdapter fallback and throw on incomplete Supabase production configuration.",
				);
			},
		},
		{
			id: "backend.no-legacy-password-auth",
			stage: "backend",
			description:
				"production auth code cannot verify legacy password_hash values.",
			run: () => {
				const productionAuth = [
					"golden-years-server-next/src/platform/auth",
					"golden-years-server-next/src/application/auth",
				]
					.map((directory) => reader.readDirectory(directory))
					.join("\n");
				return result(
					!/verifyPassword\s*\(|password_hash/.test(productionAuth),
					"Production auth code contains no legacy password verification path.",
					"Move test fakes outside production auth code and remove verifyPassword/password_hash use from runtime auth paths.",
				);
			},
		},
		{
			id: "backend.verified-email-link-only",
			stage: "backend",
			description:
				"email fallback linking rejects unverified provider identities before email lookup.",
			run: () => {
				const provisioning = reader.read(
					"golden-years-server-next/src/application/auth/identityProvisioningService.ts",
				);
				return result(
					verifiedEmailGuardPrecedesFallback(provisioning),
					"Email migration linking has an explicit verified-email guard.",
					"Require identity.emailVerified before findByEmail/linkAuthUserId migration fallback.",
				);
			},
		},
		{
			id: "backend.signup-defers-profile-linking",
			stage: "backend",
			description:
				"signup does not link or provision an app profile before email verification.",
			run: () => {
				const accounts = reader.read(
					"golden-years-server-next/src/application/auth/authAccountService.ts",
				);
				return result(
					signupDefersProfileLinking(accounts),
					"Signup defers app profile linking until verified authentication.",
					"Do not call resolveOrProvision/link/createFromAuthIdentity from signup before verification.",
				);
			},
		},
		{
			id: "backend.recovery-two-step",
			stage: "backend",
			description:
				"password recovery verifies the recovery token, then updates the authenticated user password.",
			run: () => {
				const adapter = reader.read(
					"golden-years-server-next/src/platform/auth/httpSupabaseAuthAdapter.ts",
				);
				return result(
					recoveryFlowIsTwoStep(adapter),
					"Recovery verifies first and sends the new password only to the authenticated user-update call.",
					"Implement recovery as verify token -> obtain access token -> update user password; never send password in /verify.",
				);
			},
		},
		{
			id: "backend.provider-session-disposal",
			stage: "backend",
			description:
				"temporary Supabase sessions created by password login are explicitly revoked.",
			run: () => {
				const adapter = reader.read(
					"golden-years-server-next/src/platform/auth/httpSupabaseAuthAdapter.ts",
				);
				return result(
					providerSessionIsDisposed(adapter),
					"Password login revokes the temporary provider refresh session after identity extraction.",
					"Capture the provider access token and perform a local provider logout/revocation before returning identity.",
				);
			},
		},
		{
			id: "backend.app-session-and-audience",
			stage: "backend",
			description:
				"Golden Years sessions, CSRF cookies, audience gates, and assessment claims remain authoritative.",
			run: () => {
				const session = reader.read(
					"golden-years-server-next/src/application/auth/sessionService.ts",
				);
				const middleware = reader.read(
					"golden-years-server-next/src/interface/middleware/requestContext.ts",
				);
				const pass =
					containsAll(session, [
						"sessions.create",
						"sessionCookieNames[audience]",
						"csrfCookieNames[audience]",
						"countActiveCompanies",
						'roles.includes("admin")',
						"claimAnonymousSession",
					]) &&
					containsAll(middleware, [
						"expectedAudienceForPath",
						"sessionCookieNames[audience]",
						"findActiveByTokenHash",
					]);
				return result(
					pass,
					"App session issuance and audience authorization invariants remain present.",
					"Expected app session creation, audience cookies, partner/admin gates, assessment claim, and audience-bound request lookup.",
				);
			},
		},
		{
			id: "frontend.complete-auth-api",
			stage: "frontend",
			description:
				"the frontend API facade exposes every canonical user auth operation.",
			run: () => {
				const client = reader.read(
					"golden-years-client-next/src/api/client.ts",
				);
				return result(
					frontendHasCanonicalAuthInventory(client),
					"Frontend API client contains the complete canonical auth route inventory.",
					`Expected all canonical auth paths: ${canonicalFrontendAuthPaths.join(", ")}.`,
				);
			},
		},
		{
			id: "frontend.all-user-mutations-use-csrf",
			stage: "frontend",
			description:
				"every known cookie-authenticated user mutation is in the central CSRF path inventory.",
			run: () => {
				const csrf = reader.read("golden-years-client-next/src/api/csrf.ts");
				const client = reader.read(
					"golden-years-client-next/src/api/client.ts",
				);
				return result(
					frontendHasCentralCsrfInventory(csrf, client),
					"All known user mutations use one central CSRF-aware request path.",
					`Centralize CSRF handling and cover these mutation paths: ${userMutationPaths.join(", ")}.`,
				);
			},
		},
		{
			id: "frontend.auth-viewmodel-workflows",
			stage: "frontend",
			description:
				"the auth viewmodel exposes login, logout, signup notice, and password recovery workflows.",
			run: () => {
				const viewmodel = reader.read(
					"golden-years-client-next/src/features/auth/hooks/useAuthViewModel.ts",
				);
				const required = [
					"logout",
					"requestPasswordReset",
					"confirmPasswordReset",
					"resendVerification",
				];
				const hasSuccessState =
					/kind:\s*["']success["']|kind:\s*["']notice["']/.test(viewmodel);
				return result(
					containsAll(viewmodel, required) && hasSuccessState,
					"Auth viewmodel exposes the complete workflows and a non-error success/notice state.",
					`Expected ${required.join(", ")} plus a success/notice submission state.`,
				);
			},
		},
		{
			id: "frontend.no-browser-supabase-session",
			stage: "frontend",
			description:
				"frontend auth remains a Worker BFF client with no Supabase browser session.",
			run: () => {
				const packageJson = reader.read(
					"golden-years-client-next/package.json",
				);
				const frontendAuth = [
					"golden-years-client-next/src/api",
					"golden-years-client-next/src/features/auth",
				]
					.map((directory) => reader.readDirectory(directory))
					.join("\n");
				return result(
					!/@supabase\/supabase-js/.test(`${packageJson}\n${frontendAuth}`) &&
						!/localStorage|sessionStorage/.test(frontendAuth) &&
						/credentials:\s*["']include["']/.test(frontendAuth),
					"Frontend auth uses credentialed Worker requests without browser Supabase state.",
					"Expected credentials: include and no Supabase browser SDK or browser token storage.",
				);
			},
		},
		{
			id: "docs.current-auth-key-model",
			stage: "docs",
			description:
				"deployment docs use the current publishable-key model and keep it out of frontend code.",
			run: () => {
				const docs = [
					"docs/deployment/environment-variables.md",
					"docs/deployment/supabase.md",
					"docs/deployment/cloudflare.md",
				]
					.map((file) => reader.read(file))
					.join("\n");
				return result(
					/SUPABASE_PUBLISHABLE_KEY/.test(docs) &&
						/publishable[\s\S]{0,200}(Worker|backend)/i.test(docs) &&
						/(frontend|Pages)[\s\S]{0,200}(does not|do not|never|not used)[\s\S]{0,120}Supabase/i.test(
							docs,
						),
					"Docs define the Worker publishable key while preserving the frontend BFF boundary.",
					"Document SUPABASE_PUBLISHABLE_KEY for Worker Auth calls and explicitly keep Supabase Auth out of Pages/client code.",
				);
			},
		},
		{
			id: "docs.complete-migration-order",
			stage: "docs",
			description:
				"the Supabase runbook lists every migration through the auth link migration.",
			run: () => {
				const supabase = reader.read("docs/deployment/supabase.md");
				const required = [
					"0006_assessments.sql",
					"0007_partner_companies_and_session_audiences.sql",
					"0008_supabase_auth_link.sql",
				];
				return result(
					containsAll(supabase, required),
					"Supabase migration order includes 0006 through 0008.",
					`Add missing migrations to the runbook: ${required.join(", ")}.`,
				);
			},
		},
		{
			id: "docs.auth-operations-and-cutover",
			stage: "docs",
			description:
				"runbooks cover Auth dashboard setup, abuse controls, rollout, rollback, and real-user migration.",
			run: () => {
				const supabase = reader.read("docs/deployment/supabase.md");
				const required = [
					"Site URL",
					"Redirect URLs",
					"email template",
					"SMTP",
					"CAPTCHA",
					"rate limit",
					"Rollout",
					"Rollback",
					"unlinked",
				];
				return result(
					containsAllCaseInsensitive(supabase, required),
					"Supabase runbook covers dashboard Auth setup and cutover operations.",
					`Expected operational guidance for: ${required.join(", ")}.`,
				);
			},
		},
		{
			id: "docs.contract-is-decision-complete",
			stage: "docs",
			description:
				"the completion contract states the security decisions the harness enforces.",
			run: () => {
				const contract = reader.read(
					"docs/deployment/supabase-auth-completion-contracts.md",
				);
				return result(
					completionContractIsDecisionComplete(contract),
					"Completion contract records the fail-closed, linking, recovery, session, privacy, and key decisions.",
					"Make the completion contract explicit about fail-closed config, verified-email linking, recovery tokens, provider-session disposal, generic acknowledgements, and SUPABASE_PUBLISHABLE_KEY.",
				);
			},
		},
		{
			id: "tests.backend-scenario-contracts",
			stage: "tests",
			description:
				"backend BDD files declare every exact Supabase contract scenario.",
			run: () =>
				scenarioContractResult(reader, backendScenarioContracts, "backend"),
		},
		{
			id: "tests.frontend-scenario-contracts",
			stage: "tests",
			description:
				"frontend tests declare every exact auth and CSRF contract scenario.",
			run: () =>
				scenarioContractResult(reader, frontendScenarioContracts, "frontend"),
		},
	];
}

export function productionFactoryFailsClosed(source: string) {
	const hasRequiredConfig =
		/requireSupabaseAuthConfig/.test(source) ||
		(/SUPABASE_URL/.test(source) &&
			/SUPABASE_PUBLISHABLE_KEY/.test(source) &&
			/throw new/.test(source));
	return (
		hasRequiredConfig &&
		!/DevSupabaseAuthAdapter/.test(source) &&
		!/verifyPassword|password_hash/.test(source)
	);
}

export function verifiedEmailGuardPrecedesFallback(source: string) {
	const fallbackIndex = source.indexOf("findByEmail");
	if (fallbackIndex === -1) return false;
	const prefix = source.slice(0, fallbackIndex);
	return /if\s*\(\s*!identity\.emailVerified\s*\)[\s\S]{0,260}throw/.test(
		prefix,
	);
}

export function signupDefersProfileLinking(source: string) {
	const block = methodSection(source, "async signUp", [
		"async requestPasswordReset",
	]);
	return (
		block.length > 0 &&
		!/resolveOrProvision|linkAuthUserId|createFromAuthIdentity/.test(block)
	);
}

export function recoveryFlowIsTwoStep(source: string) {
	const block = methodSection(source, "async confirmPasswordReset", [
		"async resendVerificationEmail",
		"private async",
	]);
	const verifyBody =
		block.match(
			/request\(\s*["']\/auth\/v1\/verify["']\s*,\s*\{([\s\S]*?)\}\s*(?:,\s*\{[\s\S]*?\})?\s*,?\s*\)/,
		)?.[1] ?? "";
	const verifiesRecovery =
		/type:\s*["']recovery["']/.test(verifyBody) &&
		!/\bpassword\s*[:,]/.test(verifyBody);
	const getsAccessToken = /access_token|accessToken/.test(block);
	const updatesPassword =
		/\/auth\/v1\/user|updateUser\s*\(/.test(block) && /password/.test(block);
	return verifiesRecovery && getsAccessToken && updatesPassword;
}

export function providerSessionIsDisposed(source: string) {
	const login = methodSection(source, "async signInWithPassword", [
		"async signUp",
	]);
	const callsDisposal =
		/revokeProviderSession|disposeProviderSession|signOut\s*\(/.test(login);
	const hasLocalRevocation =
		/\/auth\/v1\/logout/.test(source) ||
		/signOut\s*\(\s*\{\s*scope:\s*["']local["']/.test(source);
	return (
		/access_token|accessToken/.test(login) &&
		callsDisposal &&
		hasLocalRevocation
	);
}

export function frontendHasCanonicalAuthInventory(source: string) {
	return (
		containsAll(source, canonicalFrontendAuthPaths) &&
		!/create_session|delete_session/.test(source)
	);
}

export function frontendHasCentralCsrfInventory(
	csrfSource: string,
	clientSource: string,
) {
	const hasInventory = containsAll(csrfSource, userMutationPaths);
	const centralUse =
		/postUserMutationJson|withUserCsrfRequest/.test(clientSource) ||
		(/userMutationPaths/.test(clientSource) &&
			/withUserCsrfHeaders/.test(clientSource));
	return hasInventory && centralUse;
}

export function completionContractIsDecisionComplete(source: string) {
	return [
		/fail(?:s|ed)?[- ]closed/i,
		/verified[- ]email/i,
		/recovery[- ]token/i,
		/provider[- ]session/i,
		/generic acknowledgement/i,
		/SUPABASE_PUBLISHABLE_KEY/,
	].every((pattern) => pattern.test(source));
}

export function scenarioContractResult(
	reader: Pick<SourceReader, "read">,
	contracts: Record<string, string[]>,
	label: string,
): CheckResult {
	const missing = Object.entries(contracts).flatMap(([file, ids]) => {
		const source = reader.read(file);
		return ids
			.filter((id) => !hasScenarioTest(source, id))
			.map((id) => `${file}: ${id}`);
	});
	return result(
		missing.length === 0,
		`Every required ${label} scenario ID is present in its exact test file.`,
		`Missing ${label} scenario contracts:\n    ${missing.join("\n    ")}`,
	);
}

function hasScenarioTest(source: string, id: string) {
	const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern =
		"(?:it|test)\\s*\\(\\s*[\"'][^\"']*" + escapedId + "[^\"']*[\"']";
	return new RegExp(pattern).test(source);
}

function methodSection(source: string, start: string, ends: string[]) {
	const startIndex = source.indexOf(start);
	if (startIndex === -1) return "";
	const endIndexes = ends
		.map((end) => source.indexOf(end, startIndex + start.length))
		.filter((index) => index !== -1);
	const endIndex =
		endIndexes.length > 0 ? Math.min(...endIndexes) : source.length;
	return source.slice(startIndex, endIndex);
}

function containsAll(source: string, values: readonly string[]) {
	return values.every((value) => source.includes(value));
}

function containsAllCaseInsensitive(source: string, values: readonly string[]) {
	const normalized = source.toLowerCase();
	return values.every((value) => normalized.includes(value.toLowerCase()));
}

function result(
	condition: boolean,
	passDetails: string,
	failDetails: string,
): CheckResult {
	return condition
		? { status: "pass", details: passDetails }
		: { status: "fail", details: failDetails };
}

function createFileReader(root: string): SourceReader {
	return {
		read(relativePath) {
			return readFile(path.join(root, relativePath));
		},
		readDirectory(relativePath) {
			return listFiles(path.join(root, relativePath))
				.filter((file) => /\.(css|md|sql|ts|tsx|json|jsonc)$/.test(file))
				.filter((file) => !file.includes(`${path.sep}generated${path.sep}`))
				.filter((file) => !/\.(?:bdd\.)?test\.[^.]+$/.test(file))
				.map(readFile)
				.join("\n");
		},
		migrationFiles() {
			return listFiles(
				path.join(root, "golden-years-server-next/src/db/migrations"),
			)
				.filter((file) => file.endsWith(".sql"))
				.map((file) => path.relative(root, file));
		},
	};
}

function readFile(filePath: string) {
	if (!existsSync(filePath)) return "";
	return readFileSync(filePath, "utf8");
}

function listFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	const stat = statSync(root);
	if (stat.isFile()) return [root];
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const absolutePath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (["dist", "node_modules", ".wrangler"].includes(entry.name)) return [];
			return listFiles(absolutePath);
		}
		return [absolutePath];
	});
}

function parseArgs(argv: string[]) {
	const stageArg = valueAfter(argv, "--stage") ?? "all";
	if (stageArg !== "all" && !stages.includes(stageArg as Stage)) {
		throw new Error(
			`Unknown --stage ${stageArg}. Expected one of: all, ${stages.join(", ")}.`,
		);
	}
	return {
		stage: stageArg as Stage | "all",
		reportOnly: argv.includes("--report-only"),
	};
}

function valueAfter(argv: string[], flag: string) {
	const index = argv.indexOf(flag);
	return index === -1 ? undefined : argv[index + 1];
}

function runCli() {
	const args = parseArgs(process.argv.slice(2));
	const selectedChecks = buildChecks().filter(
		(check) => args.stage === "all" || check.stage === args.stage,
	);
	const results = selectedChecks.map((check) => ({
		check,
		result: check.run(),
	}));
	const failures = results.filter(
		({ result: checkResult }) => checkResult.status === "fail",
	);

	console.log(`Supabase Auth completion contract checks (${args.stage})`);
	console.log("");
	for (const { check, result: checkResult } of results) {
		const label = checkResult.status === "pass" ? "PASS" : "FAIL";
		console.log(`[${label}] ${check.id}`);
		console.log(`  ${check.description}`);
		console.log(`  ${checkResult.details}`);
	}
	console.log("");
	console.log(
		`${results.length - failures.length}/${results.length} checks passed.`,
	);

	if (failures.length > 0 && !args.reportOnly) {
		console.error("");
		console.error(
			"Completion contract failed. Re-run with --report-only to inspect gaps without a failing exit code.",
		);
		process.exitCode = 1;
	} else if (failures.length > 0) {
		console.log("");
		console.log(
			"Report-only mode: failures were reported without failing the command.",
		);
	}
}

if (path.resolve(process.argv[1] ?? "") === currentFile) {
	runCli();
}

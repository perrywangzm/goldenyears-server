import { AuthAccountService } from "@/application/auth/authAccountService";
import { IdentityProvisioningService } from "@/application/auth/identityProvisioningService";
import { SessionService } from "@/application/auth/sessionService";
import type { Env } from "@/config/env";
import type { Repositories } from "@/db/repositories/ports";
import { createSupabaseAuthAdapter } from "@/platform/auth/createSupabaseAuthAdapter";
import type { SupabaseAuthPort } from "@/platform/auth/supabaseAuthPort";

export type AuthServices = {
	sessions: SessionService;
	accounts: AuthAccountService;
	identityProvisioning: IdentityProvisioningService;
	supabaseAuth: SupabaseAuthPort;
};

export function createAuthServices(
	env: Env,
	repos: Repositories,
	injectedAuth?: SupabaseAuthPort,
): AuthServices {
	const supabaseAuth = injectedAuth ?? createSupabaseAuthAdapter(env);
	const identityProvisioning = new IdentityProvisioningService(repos, {
		allowEmailLinking: env.SUPABASE_RUNTIME_EMAIL_LINKING === "true",
	});
	const sessions = new SessionService(
		repos,
		supabaseAuth,
		identityProvisioning,
	);
	const accounts = new AuthAccountService(supabaseAuth);
	return { sessions, accounts, identityProvisioning, supabaseAuth };
}

export type MigrationAppUser = {
	id: string;
	email: string;
	status: "active" | "disabled";
	auth_user_id: string | null;
};

export type MigrationProviderUser = {
	id: string;
	email?: string;
	email_confirmed_at?: string | null;
};

export type UserMigrationInventory = {
	total: number;
	linked: number;
	unlinked_active: number;
	unlinked_disabled: number;
	duplicate_or_conflicting_email: number;
	missing_email: number;
	linked_missing_provider_identity: number;
	linked_email_mismatch: number;
};

export type MigrationCandidate = {
	appUser: MigrationAppUser;
	providerUser: MigrationProviderUser | null;
};

export function normalizeMigrationEmail(email: string | undefined) {
	return email?.trim().toLowerCase() ?? "";
}

export function indexProviderUsers(users: MigrationProviderUser[]) {
	const byId = new Map(users.map((user) => [user.id, user]));
	const byEmail = new Map<string, MigrationProviderUser[]>();
	for (const user of users) {
		const email = normalizeMigrationEmail(user.email);
		if (!email) continue;
		byEmail.set(email, [...(byEmail.get(email) ?? []), user]);
	}
	return { byId, byEmail };
}

export function buildUserMigrationInventory(
	appUsers: MigrationAppUser[],
	providerUsers: MigrationProviderUser[],
): UserMigrationInventory {
	const provider = indexProviderUsers(providerUsers);
	const inventory: UserMigrationInventory = {
		total: appUsers.length,
		linked: 0,
		unlinked_active: 0,
		unlinked_disabled: 0,
		duplicate_or_conflicting_email: 0,
		missing_email: 0,
		linked_missing_provider_identity: 0,
		linked_email_mismatch: 0,
	};

	for (const user of appUsers) {
		const email = normalizeMigrationEmail(user.email);
		if (!email) inventory.missing_email += 1;
		if (user.auth_user_id) {
			inventory.linked += 1;
			const providerUser = provider.byId.get(user.auth_user_id);
			if (!providerUser) inventory.linked_missing_provider_identity += 1;
			else if (normalizeMigrationEmail(providerUser.email) !== email)
				inventory.linked_email_mismatch += 1;
			continue;
		}
		if (user.status === "disabled") inventory.unlinked_disabled += 1;
		else inventory.unlinked_active += 1;
		if (email && (provider.byEmail.get(email)?.length ?? 0) > 1) {
			inventory.duplicate_or_conflicting_email += 1;
		}
	}

	return inventory;
}

export function selectMigrationCandidates(
	appUsers: MigrationAppUser[],
	providerUsers: MigrationProviderUser[],
	options: { after?: string; limit: number },
): MigrationCandidate[] {
	const provider = indexProviderUsers(providerUsers);
	return appUsers
		.filter((user) => user.status === "active" && !user.auth_user_id)
		.filter((user) => !options.after || user.id > options.after)
		.sort((left, right) => left.id.localeCompare(right.id))
		.flatMap((appUser) => {
			const email = normalizeMigrationEmail(appUser.email);
			const matches = provider.byEmail.get(email) ?? [];
			if (!email || matches.length > 1) return [];
			return [{ appUser, providerUser: matches[0] ?? null }];
		})
		.slice(0, options.limit);
}

import assert from "node:assert/strict";
import test from "node:test";
import { getUserApiKeyStatus, saveUserApiKey } from "./userApiKeys";

type StoredRow = {
    user_id: string;
    provider: string;
    encrypted_key: string;
    iv: string;
    auth_tag: string;
    updated_at: string;
};

function fakeDb(rows: StoredRow[]) {
    return {
        from(table: string) {
            assert.equal(table, "user_api_keys");
            return {
                async upsert(row: StoredRow) {
                    const existing = rows.findIndex(
                        (item) =>
                            item.user_id === row.user_id &&
                            item.provider === row.provider,
                    );
                    if (existing >= 0) rows[existing] = row;
                    else rows.push(row);
                    return { error: null };
                },
                select() {
                    return {
                        async eq(column: string, value: string) {
                            assert.equal(column, "user_id");
                            return {
                                data: rows.filter(
                                    (row) => row.user_id === value,
                                ),
                                error: null,
                            };
                        },
                    };
                },
            };
        },
    };
}

test("API-key status requires a decryptable stored key", async () => {
    const previousSecret = process.env.USER_API_KEYS_ENCRYPTION_SECRET;
    const previousCanLiiKey = process.env.CANLII_API_KEY;
    const rows: StoredRow[] = [];
    const db = fakeDb(rows);

    try {
        delete process.env.CANLII_API_KEY;
        process.env.USER_API_KEYS_ENCRYPTION_SECRET = "first-test-secret";
        await saveUserApiKey(
            "user-1",
            "canlii",
            "SYNTHETIC-USER-KEY",
            db as never,
        );

        const readable = await getUserApiKeyStatus("user-1", db as never);
        assert.equal(readable.canlii, true);
        assert.equal(readable.sources.canlii, "user");

        process.env.USER_API_KEYS_ENCRYPTION_SECRET = "different-test-secret";
        const unreadable = await getUserApiKeyStatus("user-1", db as never);
        assert.equal(unreadable.canlii, false);
        assert.equal(unreadable.sources.canlii, null);
    } finally {
        if (previousSecret === undefined)
            delete process.env.USER_API_KEYS_ENCRYPTION_SECRET;
        else process.env.USER_API_KEYS_ENCRYPTION_SECRET = previousSecret;
        if (previousCanLiiKey === undefined) delete process.env.CANLII_API_KEY;
        else process.env.CANLII_API_KEY = previousCanLiiKey;
    }
});

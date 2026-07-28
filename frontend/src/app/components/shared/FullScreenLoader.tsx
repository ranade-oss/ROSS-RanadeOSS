/**
 * The single full-screen loading state for the provider and authentication
 * gate chain. Rendering identical markup across these asynchronous branches
 * prevents server/client hydration mismatches when they resolve differently
 * during the first paint.
 */
export function FullScreenLoader() {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-gray-50/80">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
        </div>
    );
}

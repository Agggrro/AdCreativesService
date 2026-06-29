import Link from "next/link";
import { signUp } from "@/app/auth/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">
            Start building interactive ad creatives.
          </p>
        </div>

        {sp.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {sp.error}
          </p>
        )}

        <form action={signUp} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create account
          </button>
        </form>

        <p className="text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-black underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

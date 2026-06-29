import Link from "next/link";
import { signIn } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Sign in to AdInteract</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your interactive ad creatives.
          </p>
        </div>

        {sp.message === "check-email" && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            Check your email to confirm your account, then sign in.
          </p>
        )}
        {sp.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {sp.error}
          </p>
        )}

        <form action={signIn} className="space-y-4">
          <Field label="Email" name="email" type="email" />
          <Field label="Password" name="password" type="password" />
          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sign in
          </button>
        </form>

        <p className="text-sm text-gray-500">
          No account?{" "}
          <Link href="/signup" className="font-medium text-black underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type,
}: {
  label: string;
  name: string;
  type: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
      />
    </label>
  );
}

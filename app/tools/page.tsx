import Link from "next/link";
import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { StateWord, type Tone } from "@/components/ui/State";
import { CELL, HEAD, railCell, ROW, TableFrame, TableHead } from "@/components/ui/Table";

// ADR-0013's whole premise is being found by someone searching for a VAST
// validator, so these pages carry their own title rather than inheriting the
// root one.
export const metadata: Metadata = {
  title: "Free tools — VAST validator and generator",
  description:
    "Free tools for video advertising: validate a VAST tag against the IAB specification and play it in a real player. No account required.",
};

/**
 * The free tools index (ADR-0013).
 *
 * A table rather than the catalog's tile grid, and the difference is not
 * arbitrary: the catalog earns the one grid in the product because a template
 * carries no state, while a tool is either available or not yet — a real state,
 * so it takes a real rail (docs/design-system.md §6).
 *
 * Public and unauthenticated. Nothing here reads the database.
 */
export default async function ToolsPage() {
  const { dict } = await getDict();
  const t = dict.tools;

  const tools: Array<{
    href: string;
    name: string;
    description: string;
    tone: Tone;
    state: string;
  }> = [
    {
      href: "/tools/vast-validator",
      name: t.validatorName,
      description: t.validatorDescription,
      tone: "live",
      state: t.stateAvailable,
    },
    {
      href: "/tools/vast-generator",
      name: t.generatorName,
      description: t.generatorDescription,
      tone: "idle",
      state: t.stateSoon,
    },
  ];

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">{t.title}</h1>
          <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">{t.subtitle}</p>
        </div>

        <TableFrame>
          <table className="w-full min-w-[560px] border-collapse">
            <TableHead>
              <th className={HEAD}>{t.columnTool}</th>
              <th className={HEAD}>{t.columnState}</th>
            </TableHead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.href} className={ROW}>
                  <td className={railCell(tool.tone)}>
                    <div className="flex flex-col gap-1">
                      {/* Underlined at rest: the row has no other affordance,
                          and a link that only reveals itself on hover is not
                          discoverable by anyone scanning the page. */}
                      <Link
                        href={tool.href}
                        className="w-fit text-[13px] font-medium underline underline-offset-4 decoration-line hover:decoration-fg"
                      >
                        {tool.name}
                      </Link>
                      <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
                        {tool.description}
                      </p>
                    </div>
                  </td>
                  <td className={`${CELL} whitespace-nowrap align-top`}>
                    <StateWord tone={tool.tone} label={tool.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </div>
    </main>
  );
}

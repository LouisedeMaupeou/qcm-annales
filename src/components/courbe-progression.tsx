"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PointCourbe } from "@/lib/progression";

/**
 * Évolution du score normalisé par matière (§5.4, multi-courbes).
 *
 * Palette catégorielle : les séries *sont* le sujet (quelle matière progresse),
 * donc identité, pas magnitude. L'ordre des créneaux est le mécanisme de
 * sécurité daltonisme — il ne se réordonne pas et ne se recycle pas. Le premier
 * créneau porte le bleu de la marque ; l'ensemble a été validé sur surface
 * blanche (bande de clarté, plancher de chroma, séparation CVD, vision
 * normale).
 *
 * Trois de ces teintes passent sous 3:1 de contraste sur blanc : la règle de
 * relief s'applique, d'où les libellés directs en bout de courbe et le tableau
 * par matière juste en dessous, qui redit la même information sans couleur.
 */
const SERIES = [
  "#2563eb", // bleu de la marque
  "#008300",
  "#e87ba4",
  "#eda100",
  "#1baf7a",
  "#eb6834",
  "#4a3aa7",
  "#e34948",
] as const;

const INK_MUTED = "#898781";
const GRILLE = "#e1e0d9";

export function CourbeProgression({
  points,
  series,
}: {
  points: PointCourbe[];
  series: { cle: string; nom: string }[];
}) {
  if (points.length < 2) {
    return (
      <p className="rounded-carte border border-dashed border-ligne p-8 text-center text-[0.95rem]">
        Joue au moins deux sessions dans une matière pour voir ta courbe de
        progression.
      </p>
    );
  }

  return (
    <div>
      <div className="h-[280px] w-full sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {/* Pas de marge gauche négative : elle rognait le « 1 » de 100 %. */}
          <LineChart
            data={points}
            margin={{ top: 8, right: 20, bottom: 4, left: 0 }}
          >
            <CartesianGrid stroke={GRILLE} vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fill: INK_MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRILLE }}
              label={{
                value: "n° de session",
                position: "insideBottomRight",
                offset: -2,
                fill: INK_MUTED,
                fontSize: 11,
              }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: INK_MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={46}
            />
            <Tooltip
              content={<Infobulle series={series} />}
              cursor={{ stroke: INK_MUTED, strokeDasharray: "4 4" }}
            />
            {series.map((s, i) => (
              <Line
                key={s.cle}
                type="monotone"
                dataKey={s.cle}
                name={s.nom}
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0, fill: SERIES[i % SERIES.length] }}
                activeDot={{ r: 6, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Légende : l'identité ne repose jamais sur la seule couleur. */}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s, i) => (
          <li key={s.cle} className="flex items-center gap-2 text-[0.85rem]">
            <span
              aria-hidden
              className="inline-block h-0.5 w-5 rounded-full"
              style={{ backgroundColor: SERIES[i % SERIES.length] }}
            />
            {s.nom}
          </li>
        ))}
      </ul>
    </div>
  );
}

type ChargeInfobulle = {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | null }[];
};

function Infobulle({
  active,
  label,
  payload,
  series,
}: ChargeInfobulle & { series: { cle: string; nom: string }[] }) {
  if (!active || !payload?.length) return null;

  const lignes = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (lignes.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-ligne bg-white px-4 py-3 text-sm shadow-[0_8px_24px_rgba(18,38,58,.12)]">
      <p className="mb-1.5 font-extrabold text-encre">Session n° {label}</p>
      <ul className="space-y-1">
        {lignes.map((p) => {
          const rang = series.findIndex((s) => s.cle === p.dataKey);
          return (
            <li key={String(p.dataKey)} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: SERIES[rang % SERIES.length] }}
              />
              <span className="flex-1">{series[rang]?.nom}</span>
              <strong className="tabular-nums text-encre">{p.value} %</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

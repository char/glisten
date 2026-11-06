import * as UI from './ui';

type Box<T> = { value: T };
type Props = { title: string; values: number[]; active?: boolean };
const wrap = <T,>(value: T): Box<T> => ({ value });
const list: Array<Box<number>> = [wrap<number>(1), wrap(2)];
const smaller = list[0].value < list[1].value;
const ratio = 1_000 / 0x10;
const matcher = /[<>/]+/gi;
const greeting = 'Bonjour\n\u{1F44B}';

export function Summary({ title, values, active = false }: Props) {
  const label: string = `${title}: ${values.map((n) => `${n / 2}`).join(', ')}`;
  return (
    <>
      <UI.Header title={label} />
      <custom-panel data-state={active ? 'on' : 'off'} xml:lang="fr">
        Café &amp; thé — 世界
        {values.map((value, index) => (
          <span key={index} style={{ opacity: value / 100 }}>
            {matcher.test(title) ? greeting : `${value}`}
          </span>
        ))}
      </custom-panel>
      <UI.Select<number> value={values[0]} options={values} />
      {active && <strong>{`nested ${`${ratio}`}`}</strong>}
      <input {...{ title }} disabled={!active} />
    </>
  );
}

const checked = { title: 'ok', values: [1, 2] } satisfies Props;
const asserted = checked as Props;
export { smaller, checked, asserted };

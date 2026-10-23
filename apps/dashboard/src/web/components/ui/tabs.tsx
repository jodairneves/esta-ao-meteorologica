import { Tabs as Primitive } from 'radix-ui';
import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  content: ReactNode;
}

/** Underlined tabs; keyboard arrows move between them (Radix). */
export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: TabItem<T>[];
  label: string;
}) {
  return (
    <Primitive.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <Primitive.List
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-hairline"
      >
        {items.map((item) => (
          <Primitive.Trigger
            key={item.value}
            value={item.value}
            className="-mb-px border-b-2 border-transparent px-3 pt-1 pb-2.5 text-sm whitespace-nowrap text-ink-2 hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink"
          >
            {item.label}
          </Primitive.Trigger>
        ))}
      </Primitive.List>
      {items.map((item) => (
        <Primitive.Content
          key={item.value}
          value={item.value}
          className="pt-6 focus-visible:outline-none"
        >
          {item.content}
        </Primitive.Content>
      ))}
    </Primitive.Root>
  );
}

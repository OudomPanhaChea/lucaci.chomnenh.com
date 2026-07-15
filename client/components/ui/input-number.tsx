"use client";
import { InputNumber as AntInputNumber } from "antd";
import type { InputNumberProps } from "antd";

// AntD InputNumber with comma thousands separators while typing.
// Only the integer part is grouped so decimals like "0.25" stay untouched.
const group = (v: string) => {
  const [int, dec] = v.split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec !== undefined ? `.${dec}` : "");
};

export function InputNumber<T extends string | number = string | number>(
  props: InputNumberProps<T>,
) {
  return (
    <AntInputNumber<T>
      formatter={(value) => (value === undefined || value === null ? "" : group(String(value)))}
      parser={(value) => (value ?? "").replace(/,/g, "") as T}
      {...props}
    />
  );
}

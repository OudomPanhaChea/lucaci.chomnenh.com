"use client";
import { Button as AntdButton } from "antd";
import type { ButtonProps } from "antd";

// House button: the single import point for buttons so styling changes land
// everywhere at once. Heights (38/44/28px) come from the Button component
// tokens in theme-provider, which also covers AntD's own footer buttons.
export type { ButtonProps };

export function Button(props: ButtonProps) {
  return <AntdButton {...props} />;
}

export default Button;

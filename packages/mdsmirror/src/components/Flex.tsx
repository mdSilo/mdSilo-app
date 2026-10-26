import * as React from "react";
import styled from "styled-components";

type JustifyValues =
  "center" | "space-around" | "space-between" | "flex-start" | "flex-end";

type AlignValues =
  "stretch" | "center" | "baseline" | "flex-start" | "flex-end";

type Props = {
  style?: React.CSSProperties;
  $align?: AlignValues;
  $justify?: JustifyValues;
  $auto?: boolean;
  className?: string;
  children?: React.ReactNode;
};

// transient props ($): styled-components does not pass them to the DOM
const Flex = styled.div<Props>`
  display: flex;
  flex: ${({ $auto }: Props) => ($auto ? "1 1 auto" : "initial")};
  flex-direction: column;
  align-items: ${({ $align }: Props) => $align};
  justify-content: ${({ $justify }: Props) => $justify};
`;

export default Flex;

// theme.ts
import { createTheme, type MantineColorsTuple } from "@mantine/core";
import { themeToVars } from "@mantine/vanilla-extract";

const deepTeal: MantineColorsTuple = [
  "#e0f5f2",
  "#b3e8e0",
  "#7fd8cb",
  "#4dc9b7",
  "#28bba7",
  "#18ac97",
  "#0d9080", // shade 6 — primary action color
  "#087568",
  "#055a50",
  "#023f38",
];

// Do not forget to pass theme to MantineProvider
export const theme = createTheme({
  fontFamily: "serif",
  primaryColor: "deepTeal",
  colors: { deepTeal },
});

// CSS variables object, can be access in *.css.ts files
export const vars = themeToVars(theme);

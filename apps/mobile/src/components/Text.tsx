import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { color, font, type Weight } from '@/theme';

export interface Props extends TextProps {
  size?: number;
  weight?: Weight;
  tone?: string;
  align?: TextStyle['textAlign'];
  lh?: number; // line-height multiplier
  ls?: number; // letter-spacing in em
}

/** Plus Jakarta Sans ships one family per weight, so weight picks the family. */
export function Text({ size = 15, weight = 400, tone = color.ink, align, lh, ls, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: font[weight],
          fontSize: size,
          color: tone,
          textAlign: align,
          lineHeight: lh ? Math.round(size * lh) : undefined,
          letterSpacing: ls ? size * ls : undefined,
        },
        StyleSheet.flatten(style),
      ]}
    />
  );
}

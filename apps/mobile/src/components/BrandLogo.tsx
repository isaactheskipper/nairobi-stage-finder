import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStageTheme } from '../theme/themeContext';

interface BrandMarkProps {
  size?: number;
  color?: string;
}

/** Two-blade emerald ribbon "S" mark built from plain Views (no image assets). */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 32, color }) => {
  const { theme } = useStageTheme();
  const fill = color ?? theme.accentElectric;
  const bladeW = size * 0.95;
  const bladeH = size * 0.42;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.04,
          left: size * 0.12,
          width: bladeW,
          height: bladeH,
          backgroundColor: fill,
          borderTopLeftRadius: bladeH * 0.9,
          borderBottomRightRadius: bladeH * 0.9,
          borderTopRightRadius: bladeH * 0.2,
          borderBottomLeftRadius: bladeH * 0.2,
          transform: [{ skewX: '-18deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.04,
          right: size * 0.12,
          width: bladeW,
          height: bladeH,
          backgroundColor: fill,
          opacity: 0.88,
          borderTopLeftRadius: bladeH * 0.9,
          borderBottomRightRadius: bladeH * 0.9,
          borderTopRightRadius: bladeH * 0.2,
          borderBottomLeftRadius: bladeH * 0.2,
          transform: [{ skewX: '-18deg' }, { rotate: '180deg' }],
        }}
      />
    </View>
  );
};

export const BrandLockup: React.FC<{ size?: number }> = ({ size = 28 }) => {
  const { theme } = useStageTheme();
  return (
    <View style={styles.lockup}>
      <BrandMark size={size} />
      <Text
        style={[
          styles.word,
          { color: theme.textPrimary, fontSize: size * 0.72 },
        ]}
      >
        STAGE
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontWeight: '800', letterSpacing: 1 },
});


import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NAIROBI_CBD_ORIGINS } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, GLASS, RADIUS } from '../theme/tokens';
import { GlassBackdrop, GlassNoBlur } from './Glass';

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedOriginId: string;
  usingGps: boolean;
  gpsLoading: boolean;
  gpsProblem?: string;
  permissionBlocked?: boolean;
  onUseGps: () => void;
  onOpenSettings: () => void;
  onSelectOrigin: (id: string) => void;
}

/** Lets the user start from live GPS or a named CBD landmark. */
export const OriginPicker: React.FC<Props> = ({
  visible,
  onClose,
  selectedOriginId,
  usingGps,
  gpsLoading,
  gpsProblem,
  permissionBlocked,
  onUseGps,
  onOpenSettings,
  onSelectOrigin,
}) => {
  const { theme } = useStageTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GlassNoBlur>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, GLASS.sheet(theme)]}>
        <GlassBackdrop variant="sheet" />
        <View style={[styles.grab, { backgroundColor: theme.borderStrong }]} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Start from</Text>
        <ScrollView style={{ maxHeight: 380 }}>
          <Pressable
            onPress={onUseGps}
            style={[styles.row, { borderBottomColor: theme.borderSubtle }]}
            accessibilityRole="button"
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={theme.accentElectric} />
            ) : (
              <Feather name="crosshair" size={18} color={theme.accentElectric} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.textPrimary }]}>My location</Text>
              {gpsProblem ? (
                <Text style={{ fontFamily: FONTS.regular, color: theme.warningText, fontSize: 12, marginTop: 2 }}>{gpsProblem}</Text>
              ) : null}
            </View>
            {usingGps && <Feather name="check" size={18} color={theme.accentElectric} />}
          </Pressable>
          {permissionBlocked && (
            <Pressable onPress={onOpenSettings} style={styles.settings} accessibilityRole="button">
              <Text style={{ fontFamily: FONTS.bold, color: theme.accentElectric, fontWeight: '700' }}>Open settings</Text>
            </Pressable>
          )}
          {NAIROBI_CBD_ORIGINS.map((o) => {
            const active = !usingGps && o.id === selectedOriginId;
            return (
              <Pressable
                key={o.id}
                onPress={() => onSelectOrigin(o.id)}
                style={[styles.row, { borderBottomColor: theme.borderSubtle }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Feather name="map-pin" size={18} color={theme.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.textPrimary }]}>{o.name}</Text>
                  <Text style={{ fontFamily: FONTS.regular, color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>{o.streetContext}</Text>
                </View>
                {active && <Feather name="check" size={18} color={theme.accentElectric} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      </GlassNoBlur>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: 1, padding: 18, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 12 },
  title: { fontFamily: FONTS.extraBold, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, minHeight: 56 },
  name: { fontFamily: FONTS.bold, fontSize: 15, fontWeight: '700' },
  settings: { paddingVertical: 10, paddingLeft: 30 },
});

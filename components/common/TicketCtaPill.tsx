import React, { useMemo } from 'react';
import {
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';

import { getBuyTicketsLabel } from '../../utils/ticketCta';
import GathRShimmerPill from './GathRShimmerPill';

interface TicketCtaPillProps {
  onPress: (event: GestureResponderEvent) => void;
  price?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TicketCtaPill: React.FC<TicketCtaPillProps> = ({
  onPress,
  price,
  disabled = false,
  style,
  testID,
}) => {
  const label = useMemo(() => getBuyTicketsLabel(price), [price]);

  return (
    <GathRShimmerPill
      disabled={disabled}
      iconName="confirmation-number"
      label={label}
      onPress={onPress}
      style={style}
      testID={testID}
    />
  );
};

export default TicketCtaPill;

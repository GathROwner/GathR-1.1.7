import React, { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { getCategoryFallbackImage } from '../../utils/imageUtils';

/**
 * A component that displays an image with fallback support
 * When the image fails to load or isn't provided, it shows a fallback image
 */
/**
 * @param {Object} props
 * @param {string} props.imageUrl
 * @param {string} props.category
 * @param {string} [props.type='event']
 * @param {Object} [props.style={}]
 * @param {string} [props.fallbackType='post']
 * @param {string} [props.resizeMode='cover']
 * @param {((isFallback: boolean) => void) | null} [props.onFallback=null] - Callback when fallback is used
 */
const FallbackImage = ({
  imageUrl,
  category,
  type = 'event',
  style = {},
  fallbackType = 'post',
  resizeMode = 'cover',
  onFallback = null
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset error state when imageUrl changes (e.g., navigating between items)
  useEffect(() => {
    setImageError(false);
  }, [imageUrl]);

  // Notify parent when using fallback due to missing/empty URL
  useEffect(() => {
    if ((!imageUrl || imageUrl === "") && onFallback) {
      onFallback(true);
    }
  }, [imageUrl, onFallback]);

  // Get the appropriate fallback source
  const fallbackSource = getCategoryFallbackImage(category, type, fallbackType);

  // If no image URL or error loading image, show fallback
  // Use imageUrl in key to force remount when URL changes - prevents stale image caching
  if (!imageUrl || imageUrl === "" || imageError) {
    return (
      <Image
        key={`fallback-${imageUrl || 'empty'}`}
        source={fallbackSource}
        style={style}
        resizeMode={resizeMode}
      />
    );
  }

  // Otherwise, show the remote image with error handling
  const handleError = () => {
    setImageError(true);
    if (onFallback) {
      onFallback(true);
    }
  };

  return (
    <Image
      key={`remote-${imageUrl}`}
      source={{ uri: imageUrl }}
      style={style}
      onError={handleError}
      resizeMode={resizeMode}
    />
  );
};

export default FallbackImage;
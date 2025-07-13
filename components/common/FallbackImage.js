import React, { useState } from 'react';
import { Image } from 'react-native';
import { getCategoryFallbackImage } from '../../utils/imageUtils';

/**
 * A component that displays an image with fallback support
 * When the image fails to load or isn't provided, it shows a fallback image
 */
const FallbackImage = ({ 
  imageUrl, 
  category, 
  type = 'event', 
  style = {}, 
  fallbackType = 'post',
  resizeMode = 'cover'  // Add this prop with default value
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Get the appropriate fallback source
  const fallbackSource = getCategoryFallbackImage(category, type, fallbackType);
  
  // If no image URL or error loading image, show fallback
  if (!imageUrl || imageUrl === "" || imageError) {
    return (
      <Image 
        source={fallbackSource} 
        style={style}
        resizeMode={resizeMode}  // Use the prop instead of hardcoded "cover"
      />
    );
  }
  
  // Otherwise, show the remote image with error handling
  return (
    <Image 
      source={{ uri: imageUrl }} 
      style={style}
      onError={() => setImageError(true)}
      resizeMode={resizeMode}  // Use the prop instead of hardcoded "cover"
    />
  );
};

export default FallbackImage;
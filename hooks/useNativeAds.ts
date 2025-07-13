import { useEffect, useState } from 'react';
import { NativeAd, TestIds } from 'react-native-google-mobile-ads';

export type NativeAdData = {
  ad: NativeAd | null;
  loading: boolean;
};

// Type for debug reporting
export type AdDebugInfo = string[];

const getAdUnitId = (tabType: 'events' | 'specials') => {
  if (__DEV__) {
    // Temporarily use production IDs to test if ads are available
    return tabType === 'events'
      ? 'ca-app-pub-9606287073864764/7793096624' // Events Tab ID
      : 'ca-app-pub-9606287073864764/6692005621'; // Specials Tab ID
  } else {
    return tabType === 'events'
      ? 'ca-app-pub-9606287073864764/7793096624' // Events Tab ID
      : 'ca-app-pub-9606287073864764/6692005621'; // Specials Tab ID
  }
};

export default function useNativeAds(
  count: number = 3, 
  tabType: 'events' | 'specials' = 'events',
  onDebugLog?: (message: string) => void
): NativeAdData[] {
  const [nativeAdsData, setNativeAdsData] = useState<NativeAdData[]>([]);
  const adUnitId = getAdUnitId(tabType);

  // Log helper function
  const logMessage = (message: string) => {
    // LOG: AdMob debug messages - tracks ad loading, success, and errors
     console.log(`[ADMOB ${tabType}]: ${message}`);
    if (onDebugLog) {
      onDebugLog(`[ADMOB ${tabType}]: ${message}`);
    }
  };

  useEffect(() => {
    // LOG: Ad initialization start
     logMessage(`Initializing ${count} native ads with unit ID: ${adUnitId}`);
     logMessage(`Using ad unit ID: ${adUnitId} (${__DEV__ ? 'TEST MODE' : 'PRODUCTION MODE'})`);
    
    // Initialize with empty/loading state
    setNativeAdsData(Array(count).fill(0).map(() => ({
      ad: null,
      loading: true,
    })));

    const nativeAds: NativeAd[] = [];

    // Create and load native ads
    const loadAds = async () => {
      for (let index = 0; index < count; index++) {
        try {
          // LOG: Ad creation process start
           logMessage(`Creating ad ${index + 1}/${count} - process starting`);
           logMessage(`Calling NativeAd.createForAdRequest for ad ${index + 1}`);
          
          NativeAd.createForAdRequest(adUnitId, {
            requestNonPersonalizedAdsOnly: true,
            keywords: ['events', 'entertainment', 'food', 'specials', 'drinks'],
            requestAgent: 'GathR', // Adding app identifier for better attribution
          })
            .then(nativeAd => {
              // LOG: Ad loading success
               logMessage(`✅ Ad ${index + 1} Promise RESOLVED successfully`);
              
              // Log ad object details
              try {
                // Fix for TypeScript error - use type assertion
                const adProps = Object.keys(nativeAd as any).filter(prop => 
                  typeof (nativeAd as any)[prop] !== 'function'
                );
                // LOG: Ad properties inspection
                 logMessage(`Ad ${index + 1} properties: ${adProps.join(', ')}`);
                
                // Check for key properties that should be in a loaded ad
                if (nativeAd.headline) {
                  // LOG: Ad has headline
                   logMessage(`Ad ${index + 1} has headline: "${nativeAd.headline}"`);
                } else {
                  // LOG: Ad missing headline
                   logMessage(`Ad ${index + 1} has NO headline - might not be fully loaded`);
                }
                
                // Check for advertiser
                if (nativeAd.advertiser) {
                  // LOG: Ad has advertiser
                   logMessage(`Ad ${index + 1} has advertiser: "${nativeAd.advertiser}"`);
                }
                
                // Check if there's media content
                if (nativeAd.mediaContent) {
                  // LOG: Ad has media content
                   logMessage(`Ad ${index + 1} has media content`);
                } else {
                  // LOG: Ad missing media content
                   logMessage(`Ad ${index + 1} has NO media content`);
                }
                
                // Check for available methods - Fixed for TypeScript
                const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(nativeAd))
                  .filter(name => typeof (Object.getPrototypeOf(nativeAd) as any)[name] === 'function');
                // LOG: Ad methods inspection
                 logMessage(`Ad ${index + 1} methods: ${methodNames.join(', ')}`);
              } catch (error) {
                // LOG: Ad inspection error
                 logMessage(`Error inspecting ad ${index + 1}: ${error instanceof Error ? error.message : "Unknown"}`);
              }
              
              // Store reference to the native ad for cleanup
              nativeAds.push(nativeAd);
              
              // Update state with the loaded ad
              // LOG: Ad state update
               logMessage(`Updating state for ad ${index + 1} - no longer loading`);
              setNativeAdsData(prev => {
                const updated = [...prev];
                updated[index] = { ad: nativeAd, loading: false };
                return updated;
              });
              
              // LOG: Ad processing complete
               logMessage(`Ad ${index + 1} successfully processed and ready for display`);
            })
            .catch(error => {
              // LOG: Ad creation error
               logMessage(`❌ Ad ${index + 1} creation ERROR: ${error instanceof Error ? error.message : "Unknown error"}`);
              
              // Add more detailed error info
              if (error instanceof Error && error.stack) {
                // LOG: Error stack trace
                 logMessage(`Error stack: ${error.stack.split('\n')[0]}`);
              }
              
              // If error has properties, log them
              try {
                const errorProps = Object.keys(error as any).join(', ');
                if (errorProps) {
                  // LOG: Error properties
                   logMessage(`Error properties: ${errorProps}`);
                }
              } catch (e) {
                // Ignore
              }
              
              // Update state to indicate loading failed
              setNativeAdsData(prev => {
                const updated = [...prev];
                updated[index] = { ad: null, loading: false };
                return updated;
              });
              
              // LOG: Ad marked as failed
               logMessage(`Ad ${index + 1} marked as failed in state`);
            });
            
          // LOG: Async request initiated
           logMessage(`Async request for ad ${index + 1} has been initiated`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          // LOG: Fatal ad creation error
           logMessage(`⚠️ Fatal error creating ad ${index + 1}: ${errorMessage}`);
          
          if (error instanceof Error && error.stack) {
            // LOG: Fatal error stack trace
             logMessage(`Stack trace: ${error.stack.substring(0, 150)}...`);
          }
          
          // Update state to indicate loading failed
          setNativeAdsData(prev => {
            const updated = [...prev];
            updated[index] = { ad: null, loading: false };
            return updated;
          });
          
          // LOG: Ad marked as failed due to fatal error
           logMessage(`Ad ${index + 1} marked as failed due to fatal error`);
        }
      }
    };
    
    // LOG: Load ads function start
     logMessage('Starting loadAds() function');
    loadAds().then(() => {
      // LOG: Load ads function complete
       logMessage('loadAds() function completed');
    }).catch(error => {
      // LOG: Load ads function error
      logMessage(`Error in loadAds(): ${error instanceof Error ? error.message : "Unknown error"}`);
    });

    // Cleanup function to destroy all native ads
    return () => {
      // LOG: Ad cleanup start
       logMessage(`Cleaning up ${nativeAds.length} ads`);
      nativeAds.forEach((nativeAd, index) => {
        try {
          // LOG: Destroying individual ad
           logMessage(`Destroying ad ${index + 1}`);
          nativeAd.destroy();
          // LOG: Ad destruction success
         logMessage(`Ad ${index + 1} destroyed successfully`);
        } catch (error) {
          // LOG: Ad destruction error
           logMessage(`Error destroying ad ${index + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      });
    };
  }, [count, adUnitId, onDebugLog]);

  return nativeAdsData;
}
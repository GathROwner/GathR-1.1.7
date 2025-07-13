// services/userService.js
import { auth, firestore } from '../config/firebaseConfig';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

// In-memory cache for user data
let cachedUserInterests = [];
let cachedUserFavorites = [];
let cachedSavedEvents = []; // New cache for saved events

export async function getUserInterests() {
  // Return cached data if available
  if (cachedUserInterests.length > 0) return cachedUserInterests;
  
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedUserInterests = userData.userInterests || [];
      return cachedUserInterests;
    }
    return [];
  } catch (error) {
    console.error('Error fetching user interests:', error);
    return [];
  }
}

export async function getUserFavorites() {
  // Return cached data if available
  if (cachedUserFavorites.length > 0) return cachedUserFavorites;
  
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedUserFavorites = userData.favorites || [];
      return cachedUserFavorites;
    }
    return [];
  } catch (error) {
    console.error('Error fetching user favorites:', error);
    return [];
  }
}

/**
 * Gets the current user's saved events
 * @returns {Promise<string[]>} Array of saved event IDs
 */
export async function getSavedEvents() {
  // Return cached data if available
  if (cachedSavedEvents.length > 0) return cachedSavedEvents;
  
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedSavedEvents = userData.savedEvents || [];
      return cachedSavedEvents;
    }
    return [];
  } catch (error) {
    console.error('Error fetching saved events:', error);
    return [];
  }
}

/**
 * Toggles an event's saved status
 * @param {string|number} eventId - The ID of the event to toggle
 * @returns {Promise<{success: boolean, saved: boolean, message: string}>} Result object
 */
export async function toggleSavedEvent(eventId) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, message: 'No user logged in' };
  
  try {
    // Get the current saved events
    const savedEvents = await getSavedEvents();
    const eventIdString = eventId.toString();
    const isCurrentlySaved = savedEvents.includes(eventIdString);
    
    // Reference to the user document
    const userRef = doc(firestore, 'users', currentUser.uid);
    
    if (isCurrentlySaved) {
      // Remove from saved events
      await updateDoc(userRef, {
        savedEvents: arrayRemove(eventIdString)
      });
      
      // Update cache
      cachedSavedEvents = cachedSavedEvents.filter(id => id !== eventIdString);
      
      return { success: true, saved: false, message: 'Event removed from saved items' };
    } else {
      // Add to saved events
      await updateDoc(userRef, {
        savedEvents: arrayUnion(eventIdString)
      });
      
      // Update cache
      cachedSavedEvents.push(eventIdString);
      
      return { success: true, saved: true, message: 'Event saved successfully' };
    }
  } catch (error) {
    console.error('Error toggling saved event:', error);
    return { success: false, message: 'Failed to update saved event' };
  }
}

/**
 * Checks if an event is saved by the current user
 * @param {string|number} eventId - The ID of the event to check
 * @returns {Promise<boolean>} Whether the event is saved
 */
export async function isEventSaved(eventId) {
  const savedEvents = await getSavedEvents();
  return savedEvents.includes(eventId.toString());
}

export function clearUserDataCache() {
  cachedUserInterests = [];
  cachedUserFavorites = [];
  cachedSavedEvents = []; // Clear saved events cache
}
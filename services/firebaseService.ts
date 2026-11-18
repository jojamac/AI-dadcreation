import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, addDoc, doc, setDoc, query, orderBy, deleteDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { ClonedVoice, Asset } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export const signInApp = async () => {
  try {
    const userCredential = await signInAnonymously(auth);
    //console.log("Firebase: Signed in anonymously", userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error("Firebase: Error signing in anonymously", error);
    // Don't throw, just log. The app might work in read-only mode or fail later on writes.
  }
};

const VOICES_COLLECTION = 'voices';
const ASSETS_COLLECTION = 'assets';

// --- VOICES ---

export const getClonedVoices = async (): Promise<ClonedVoice[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, VOICES_COLLECTION));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ClonedVoice));
  } catch (error) {
    console.error("Error fetching voices from Firebase:", error);
    return [];
  }
};

export const uploadAndCloneVoice = async (name: string, file: File): Promise<ClonedVoice> => {
  console.log(`FirebaseService: Uploading "${file.name}"...`);

  // 1. Upload original file to Storage
  const fileRef = ref(storage, `voice-samples/${self.crypto.randomUUID()}-${file.name}`);

  try {
    const uploadResult = await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(uploadResult.ref);

    console.log(`FirebaseService: File stored at ${downloadUrl}`);

    // 2. Save metadata to Firestore
    const newVoiceRef = doc(collection(db, VOICES_COLLECTION));

    const newVoice: ClonedVoice = {
      id: newVoiceRef.id,
      name,
      sampleUrl: downloadUrl,
      isCustom: true,
    };

    await setDoc(newVoiceRef, newVoice);
    console.log("FirebaseService: New voice metadata saved.", newVoice);

    return newVoice;
  } catch (error) {
    console.error("Error uploading/saving voice:", error);
    throw new Error("Failed to upload voice sample.");
  }
};

// --- ASSET HISTORY ---

export const getAssets = async (): Promise<Asset[]> => {
  try {
    const q = query(collection(db, ASSETS_COLLECTION), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Asset));
  } catch (error) {
    console.error("Error fetching assets:", error);
    // Fallback if index missing or error
    return [];
  }
};

export const saveAsset = async (imageFile: File | Blob, audioBlob: Blob, text: string, voiceName: string): Promise<void> => {
  try {
    // 1. Upload Image
    const imageId = self.crypto.randomUUID();
    const imageRef = ref(storage, `assets-images/${imageId}`);
    await uploadBytes(imageRef, imageFile);
    const imageUrl = await getDownloadURL(imageRef);

    // 2. Upload Audio
    const audioId = self.crypto.randomUUID();
    const audioRef = ref(storage, `assets-audio/${audioId}.wav`);
    await uploadBytes(audioRef, audioBlob);
    const audioUrl = await getDownloadURL(audioRef);

    // 3. Save Metadata
    await addDoc(collection(db, ASSETS_COLLECTION), {
      imageUrl,
      audioUrl,
      text,
      voiceName,
      createdAt: Date.now()
    });
    console.log("Asset saved to history.");

  } catch (error) {
    console.error("Error saving asset:", error);
    throw error;
  }
};

export const deleteAsset = async (id: string, imageUrl: string, audioUrl: string): Promise<void> => {
  try {
    // 1. Delete from Firestore
    await deleteDoc(doc(db, ASSETS_COLLECTION, id));

    // 2. Delete Images from Storage (optional, strictly speaking, but good for cleanup)
    // Note: Deleting by URL is tricky in Firebase Storage client SDK directly if we don't have the ref path.
    // However, we can use ref(storage, url) which works!

    const imageRef = ref(storage, imageUrl);
    const audioRef = ref(storage, audioUrl);

    await Promise.all([
      deleteObject(imageRef).catch(e => console.warn("Error deleting image file:", e)),
      deleteObject(audioRef).catch(e => console.warn("Error deleting audio file:", e))
    ]);

    console.log(`Asset ${id} deleted.`);
  } catch (error) {
    console.error("Error deleting asset:", error);
    throw error;
  }
};
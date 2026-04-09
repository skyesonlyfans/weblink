import { 
    getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, 
    collection, onSnapshot, arrayRemove, arrayUnion 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const db = getFirestore();
const auth = getAuth();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'weblink-v4';

/**
 * PROFILE MANAGEMENT
 * Updates PFP, Bio, and Pronouns
 */
export async function updateProfile(data) {
    if (!auth.currentUser) return;
    
    try {
        const userRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'account', 'profile');
        await setDoc(userRef, {
            photoURL: data.avatar || "",
            bio: data.bio || "",
            pronouns: data.pronouns || "",
            username: data.username || auth.currentUser.displayName || "Anonymous",
            updatedAt: Date.now()
        }, { merge: true });
        
        return { success: true };
    } catch (error) {
        console.error("Profile update failed:", error);
        return { success: false, error };
    }
}

/**
 * FRIEND REQUESTS
 * Logic for sending, accepting, and listening for requests
 */

// Send a request to another user
export async function sendFriendRequest(targetUid, myData) {
    if (!auth.currentUser) return;
    const requestRef = doc(db, 'artifacts', appId, 'users', targetUid, 'friend_requests', auth.currentUser.uid);
    await setDoc(requestRef, {
        fromUid: auth.currentUser.uid,
        fromName: myData.username,
        fromAvatar: myData.avatar || "",
        status: 'pending',
        timestamp: Date.now()
    });
}

// Accept a pending request
export async function acceptFriendRequest(requestData) {
    const myUid = auth.currentUser.uid;
    const theirUid = requestData.fromUid;

    // 1. Add them to my friends list
    await setDoc(doc(db, 'artifacts', appId, 'users', myUid, 'friends', theirUid), {
        uid: theirUid,
        username: requestData.fromName,
        avatar: requestData.fromAvatar,
        addedAt: Date.now()
    });

    // 2. Add me to their friends list (Requires consistent Profile pathing)
    const myProfileSnap = await getDoc(doc(db, 'artifacts', appId, 'users', myUid, 'account', 'profile'));
    const myProfile = myProfileSnap.data() || {};

    await setDoc(doc(db, 'artifacts', appId, 'users', theirUid, 'friends', myUid), {
        uid: myUid,
        username: myProfile.username || "Unknown",
        avatar: myProfile.photoURL || "",
        addedAt: Date.now()
    });

    // 3. Clean up the request
    await deleteDoc(doc(db, 'artifacts', appId, 'users', myUid, 'friend_requests', theirUid));
}

/**
 * GROUP MANAGEMENT
 * Logic for Host Deletion vs Member Leaving
 */

export async function handleGroupExit(groupId, isHost, myPeerId, myUsername) {
    const groupRef = doc(db, 'artifacts', appId, 'public', 'data', 'groups', groupId);
    const pairingRef = doc(db, 'artifacts', appId, 'public', 'data', 'pairing_codes', groupId);

    if (isHost) {
        // Disband the group entirely
        await deleteDoc(groupRef);
        await deleteDoc(pairingRef);
        return "Group deleted by host.";
    } else {
        // Just remove myself from the members array
        await updateDoc(groupRef, {
            members: arrayRemove({ peerId: myPeerId, username: myUsername })
        });
        return "You left the group.";
    }
}

/**
 * INITIALIZE LISTENERS
 * Helper to set up UI listeners for requests
 */
export function initUpdateListeners(callbacks) {
    if (!auth.currentUser) return;

    // Listen for incoming friend requests
    const q = collection(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'friend_requests');
    return onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (callbacks.onRequestsUpdate) callbacks.onRequestsUpdate(requests);
    }, (err) => console.error("Request listener failed:", err));
}

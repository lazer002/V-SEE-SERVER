const express = require('express')
const app = express()
const router = express.Router()
const passport = require('passport')
const newuser = require('../model/Signup')
const message = require('../model/message')
const Chat = require('../model/chat')
const jweb = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const secret = process.env.Secret_code
const mongoose = require('mongoose')

const authMiddleware = require('../auth/authMiddleware')




router.get('/getuser', authMiddleware, async (req, res) => {
  try {
    const sessionUserId = req.user_id;
    const user = { email: req.email, user_id: sessionUserId };

    const Suser = await newuser.findOne({ user_id: sessionUserId });

    if (!Suser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // INCOMING: Friends who added me and I accepted
    const incomingFriendIds = Suser.friend_requests
      .filter(request => request.status === 'accepted')
      .map(request =>
        request.from_user?._id?.toString?.() || request.from_user?.toString?.()
      )
      .filter(Boolean);

    // OUTGOING: I added others and they accepted
    const outgoingUsers = await newuser.find({
      friend_requests: {
        $elemMatch: {
          from_user: Suser._id,
          status: 'accepted'
        }
      }
    });

    const outgoingFriendIds = outgoingUsers.map(user => user._id.toString());

    // Combine both
    const allFriendObjectIds = Array.from(
      new Set([...incomingFriendIds, ...outgoingFriendIds])
    );

    // Fetch friend details by ObjectId (not user_id now)
    const data = await newuser.find({
      _id: { $in: allFriendObjectIds }
    }).select('user_id username email Profile');

    return res.status(200).json({ data, user });

  } catch (error) {
    console.log('error: ', error);
    return res.status(500).json({ msg: 'Server error' });
  }
});



router.post('/getmessage', authMiddleware, async (req, res) => {
  try {
    const userId = req.user_id;
    const receiverId = req.body.receiverId;
    const data = await Chat.find({
      $or: [
        { user1Id: userId, user2Id: receiverId },
        { user1Id: receiverId, user2Id: userId }
        // { user1Id: userId, user2Id: userId }
      ]
    });

    const userdata = await newuser.find({user_id:receiverId});
   
    
    return res.status(200).json({data,userdata});
  } catch (error) {
    console.log('error: ', error);
    res.status(500).json({ msg: 'Server error' });
  }
});



// ##############################   user Profile  ##########################



router.post('/userProfile', async (req, res) => {
  try {

    const { userId } = req.body
    data = await newuser.findOne({ _id:userId })
    return res.status(200).json(data)
  } catch (error) {
    console.log('error: ', error);
  }
})


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });
router.post('/updateUser', upload.single('Profile'), async (req, res) => {
  try {
    const { userId, username, email } = req.body;
    const profileImage = req.file;

    const updateData = { username, email };

    if (profileImage) {
      
      updateData.Profile = profileImage.path; 
    }
    
    console.log('updateData:', updateData);

    const updatedUser = await newuser.findByIdAndUpdate(userId, updateData, { new: true });

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(updatedUser);

  } catch (error) {
    console.log('Error:', error);
    return res.status(500).json({ error: 'An error occurred while updating user data' });
  }
});




// ############################## uuser login ##########################

router.post('/signup', async (req, res) => {
  try {
    console.log(req.body);
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.json({ msg: 'Please fill in all fields' });
    }

    const existingUser = await newuser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    bcrypt.hash(password, 12, async function (err, hashedPassword) {
      if (err) {
        return res.status(500).json({ msg: 'Error hashing password' });
      }

      const user_id = `user_${Math.floor(Math.random() * 1000000)}`;
      const data = new newuser({ email, password: hashedPassword, username, user_id });
      const token = jweb.sign({ email }, secret);

      await data.save();
      res.json({ token });
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error' });
  }
});


router.post('/signin', async (req, res) => {
  try {
console.log(req.body);
    const { email, password } = req.body
    let data = await newuser.findOne({ email: email })
    if (!data) {
      console.log('data: ', data);
      return res.status(400).json({ msg: 'Incorrect Details' })
    }
    ismatch = await bcrypt.compare(password, data.password)

    if (ismatch) {
      const token = jweb.sign({ email: email, user_id: data.user_id }, secret, { expiresIn: '3d' })
      // console.log(token)
      return res.status(200).json({ token })
    } else {
      return res.status(400).json({ msg: ' sahi password pappu' })
    }

  } catch (error) {
    console.log(error)
  }
})


// ############################  seacrh friend ####################


router.post('/searchfriend', authMiddleware, async (req, res) => {
  try {
    const { userkey } = req.body;
    const data = await newuser.find({ 
      $or: [ 
        { username: { $regex: userkey, $options: 'i' } },  
        { email: { $regex: userkey, $options: 'i' } }      
      ] 
    });

    if (data.length === 0) {
      return res.status(404).json({ msg: 'No users found' });
    }

    return res.status(200).json({ data });
  } catch (error) {
    console.log('error: ', error);
    return res.status(500).json({ msg: 'Server error' });
  }
});




router.post('/addfriend', authMiddleware, async (req, res) => {
  try {
    const { a, action } = req.body; // a = receiver's user_id
    const sessionUserId = req.user_id;

    // Fetch full user documents
    const [sessionUser, receiverUser] = await Promise.all([
      newuser.findOne({ user_id: sessionUserId }),
      newuser.findOne({ user_id: a }),
    ]);

    if (!sessionUser || !receiverUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const senderObjectId = sessionUser._id;
    const receiverObjectId = receiverUser._id;

    // Check if friend request already exists in receiver's record
    const existingReceiverRequest = receiverUser.friend_requests.find(
      (request) => String(request.from_user) === String(senderObjectId)
    );

    if (existingReceiverRequest) {
      if (action === 'Add') {
        return res.status(400).json({ msg: 'Request already sent' });
      } else {
        // Delete request from both sender and receiver
        await Promise.all([
          newuser.updateOne(
            { _id: receiverObjectId },
            { $pull: { friend_requests: { from_user: senderObjectId } } }
          ),
          newuser.updateOne(
            { _id: senderObjectId },
            { $pull: { friend_requests: { from_user: receiverObjectId } } }
          )
        ]);
        return res.status(200).json({ msg: 'Request deleted' });
      }
    }

    // Add request to both sender and receiver
    await Promise.all([
      newuser.updateOne(
        { _id: receiverObjectId },
        { $addToSet: { friend_requests: { from_user: senderObjectId, status: 'pending' } } }
      ),
      newuser.updateOne(
        { _id: senderObjectId },
        { $addToSet: { friend_requests: { from_user: receiverObjectId, status: 'pending' } } }
      )
    ]);

    return res.status(200).json({ msg: 'Request sent' });

  } catch (error) {
    console.error('Error occurred:', error);
    return res.status(500).json({ msg: 'Server error' });
  }
});



router.get('/friend-requests', authMiddleware, async (req, res) => {
  try {
    const sessionUserId = req.user_id;

    const user = await newuser.findOne({ user_id: sessionUserId }).populate({
      path: 'friend_requests.from_user',
      select: 'user_id username email Profile'
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const receivedRequests = user.friend_requests
      .filter(req =>
        req.status === 'pending' &&
        String(req.from_user?._id) !== String(user._id)
      )
      .map(req => req.from_user)
      .filter(Boolean);

    res.status(200).json({
      Frequests: receivedRequests,
      msg: 'Pending friend requests received.'
    });

  } catch (error) {
    console.error('Error fetching friend requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post('/acceptfriend', authMiddleware, async (req, res) => {
  const { from_user_id } = req.body; // custom user_id like "user_709960"
  const sessionUserId = req.user_id;

  try {
    const [fromUserDoc, sessionUserDoc] = await Promise.all([
      newuser.findOne({ user_id: from_user_id }),
      newuser.findOne({ user_id: sessionUserId })
    ]);

    if (!fromUserDoc || !sessionUserDoc) {
      return res.status(404).json({ msg: 'User not found.' });
    }

    const senderObjectId = fromUserDoc._id;
    const receiverObjectId = sessionUserDoc._id;

    // 1. Update receiver's friend_requests where from_user is sender
    const receiverUpdate = await newuser.updateOne(
      { _id: receiverObjectId, 'friend_requests.from_user': senderObjectId },
      { $set: { 'friend_requests.$.status': 'accepted' } }
    );

    // 2. Ensure sender also has accepted request toward receiver
    const senderHasRequest = fromUserDoc.friend_requests.some(
      r => r.from_user.toString() === receiverObjectId.toString()
    );

    let senderUpdate;
    if (senderHasRequest) {
      // If already exists, update it
      senderUpdate = await newuser.updateOne(
        { _id: senderObjectId, 'friend_requests.from_user': receiverObjectId },
        { $set: { 'friend_requests.$.status': 'accepted' } }
      );
    } else {
      // Otherwise, add it
      senderUpdate = await newuser.updateOne(
        { _id: senderObjectId },
        {
          $addToSet: {
            friend_requests: {
              from_user: receiverObjectId,
              status: 'accepted'
            }
          }
        }
      );
    }

 return res.status(200).json({ msg: 'Friend request accepted successfully.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Failed to accept friend request.' });
  }
});



router.post('/rejectfriend', authMiddleware, async (req, res) => {
  const { from_user_id } = req.body; // this is like "user_709960"
  const sessionUserId = req.user_id;

  try {
    // Get sender's ObjectId
    const sender = await newuser.findOne({ user_id: from_user_id });
    if (!sender) {
      return res.status(404).json({ msg: 'Sender user not found.' });
    }

    await newuser.updateOne(
      { user_id: sessionUserId },
      { $pull: { friend_requests: { from_user: sender._id } } }
    );

    res.status(200).json({ msg: 'Friend request rejected successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Failed to reject friend request.' });
  }
})


router.post('/removefriend', authMiddleware, async (req, res) => {
  const { friend_user_id } = req.body; // This is a string like "user_709960"
  const sessionUserId = req.user_id;

  try {
    // Find both users
    const [sessionUser, friendUser] = await Promise.all([
      newuser.findOne({ user_id: sessionUserId }),
      newuser.findOne({ user_id: friend_user_id }),
    ]);

    if (!sessionUser || !friendUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const sessionUserObjectId = sessionUser._id;
    const friendUserObjectId = friendUser._id;

    // Pull accepted friend relationships from both users
    await Promise.all([
      newuser.updateOne(
        { _id: sessionUserObjectId },
        { $pull: { friend_requests: { from_user: friendUserObjectId, status: 'accepted' } } }
      ),
      newuser.updateOne(
        { _id: friendUserObjectId },
        { $pull: { friend_requests: { from_user: sessionUserObjectId, status: 'accepted' } } }
      )
    ]);

    res.status(200).json({ msg: 'Friend removed successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Failed to remove friend.' });
  }
});



router.get('/friends', authMiddleware, async (req, res) => {
  try {
    const sessionUserId = req.user_id;

    // Fetch current user with populated incoming accepted requests
    const user = await newuser.findOne({ user_id: sessionUserId }).populate({
      path: 'friend_requests.from_user',
      select: 'user_id username email Profile'
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 1. Friends who sent request to me and I accepted
    const acceptedIncoming = user.friend_requests
      .filter(req => req.status === 'accepted')
      .map(req => req.from_user)
      .filter(Boolean);

    const acceptedOutgoingUsers = await newuser.find({
      'friend_requests': {
        $elemMatch: {
          from_user: user._id,
          status: 'accepted'
        }
      }
    }, 'user_id username email Profile');

    // Merge both arrays, remove duplicates (if any)
    const allFriendsMap = new Map();

    acceptedIncoming.forEach(friend => {
      allFriendsMap.set(friend.user_id, friend);
    });

    acceptedOutgoingUsers.forEach(friend => {
      allFriendsMap.set(friend.user_id, friend);
    });

    const allFriends = Array.from(allFriendsMap.values());

    res.status(200).json({
      Frequests: allFriends,
      msg: 'All accepted friends retrieved successfully.'
    });

  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router



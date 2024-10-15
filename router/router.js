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

const authMiddleware = require('../auth/authMiddleware')







router.get('/getuser', authMiddleware, async (req, res) => {
  try {
    const user = { email: req.email, user_id: req.user_id };
    const data = await newuser.find({ user_id: { $ne: req.user_id },'friend_requests.status': 'accepted' });
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


// ################################## add friend ################################


router.post('/addfriend', authMiddleware, async (req, res) => {
  try {
    console.log(req.body);
    const { a, action } = req.body;
    const sessionUserId = req.user_id;

    const user = await newuser.findOne({ user_id: a });

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const existingRequest = user.friend_requests.find(
      (request) => request.from_user === sessionUserId
    );

    if (existingRequest) {
      if (action === 'Add') {
        return res.status(400).json({ msg: 'Request already sent' });
      } else {
        await newuser.findOneAndUpdate(
          { user_id: a },
          { $pull: { friend_requests: { from_user: sessionUserId } } },
          { new: true }
        );
        return res.status(200).json({ msg: 'Request deleted' });
      }
    }

    const updateData = action === 'Add' 
      ? { $addToSet: { friend_requests: { from_user: sessionUserId, status: 'pending' } } } 
      : { $addToSet: { friend_requests: { from_user: sessionUserId, status: 'rejected' } } };

      
      console.log('user_id: ', a);
    await newuser.findOneAndUpdate(
      { user_id: a },
      updateData,
      { new: true }
    );

    return res.status(200).json({ msg: 'Request sent' });

  } catch (error) {
    console.log('error: ', error);
    return res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/friendreq', async (req, res) => {
  try {
    const users = await newuser.find({});

    const updatedUsers = await Promise.all(users.map(async (user) => {
      const friendRequestsWithDetails = await Promise.all(
        user.friend_requests.map(async (request) => {
          const fromUserDetails = await newuser.findOne(
            { user_id: request.from_user },
            { username: 1, email: 1, user_id: 1 } // Select fields you need
          );
          return {
            ...request._doc,  // Spread the original request data
            from_user_details: fromUserDetails || {}, // Add full user details
          };
        })
      );
      
      console.log('user_id: ', a);
    await newuser.findOneAndUpdate(
      { user_id: a },
      updateData,
      { new: true }
    );

    return res.status(200).json({ msg: 'Request sent' });

  })) }catch (error) {
    console.log('error: ', error);
    return res.status(500).json({ msg: 'Server error' });
  }
});



router.get('/friend-requests', authMiddleware, async (req, res) => {
  try {
    const sessionUserId = req.user_id;
    const user = await newuser.findOne({ user_id: sessionUserId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Filter only the friend requests where status is 'accepted'
    const acceptedFriendRequests = user.friend_requests.filter(request => request.status === 'pending');

    // Fetch the details of users who sent accepted friend requests
    const fromUserDetails = await Promise.all(acceptedFriendRequests.map(async (request) => {
      const fromUserId = request.from_user;
      const fromUser = await newuser.findOne({ user_id: fromUserId });

      return fromUser || null;
    }));

    res.json({ Frequests: fromUserDetails });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});


router.post('/acceptfriend', authMiddleware, async (req, res) => {
  const { from_user_id } = req.body;
  const sessionUserId = req.user_id;

  try {
    const updateResult = await newuser.updateOne(
      { user_id: sessionUserId, 'friend_requests.from_user': from_user_id },
      { $set: { 'friend_requests.$.status': 'accepted' } }
    );


    if (updateResult.matchedCount > 0) {
      const updatedUser = await newuser.findOne({ user_id: sessionUserId });
      res.status(200).json({ msg: 'Friend request accepted successfully.', updatedUser });
    } else {
      res.status(404).json({ msg: 'Friend request not found.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Failed to accept friend request.' });
  }
});

router.post('/rejectfriend',authMiddleware, async (req, res) => {
  const { from_user_id } = req.body;
  const sessionUserId = req.user_id;
  try {
    await newuser.updateOne(
      { user_id: sessionUserId },
      { $pull: { friend_requests: { from_user: from_user_id } } }
    );
    res.status(200).json({ msg: 'Friend request rejected successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Failed to reject friend request.' });
  }
});

module.exports = router



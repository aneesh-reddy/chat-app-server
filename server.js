// requiring all the
require('dotenv').config();
const express=require("express");
const mongoose=require("mongoose");
const bodyParser=require("body-parser");
const Pusher = require("pusher");
const cors =require("cors");
const { json } = require("body-parser");


//app config

const app=express();
app.use(express.urlencoded({extended:true}));
const port =process.env.PORT||9000;
const pusher = new Pusher({
    appId: process.env.PUSHER_APPID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: "eu",
    useTLS: true
  });

//middleware
app.use(express.json());
app.use(cors());


//database
mongoose.connect("mongodb+srv://"+process.env.MDB_ID+":"+process.env.MDB_PASS+"@cluster0.798hh.mongodb.net/WhatsappDB?retryWrites=true&w=majority",{useNewUrlParser:true,useUnifiedTopology: true,useFindAndModify: false})


const whatsappDBSchema= new mongoose.Schema({
    message:String,
    name:String,
    timestamp:String,
    received:Boolean
   
})

const roomSchema=new mongoose.Schema({
    roomname:String,
    messages:[whatsappDBSchema]
})

const userSchema=new mongoose.Schema({
    name:String,
    email:String,
    roomIds:[String],
    actrooms:[{type:mongoose.Schema.Types.ObjectId,ref:"Room"}]
})

const Room =mongoose.model("Room",roomSchema);
const User =mongoose.model("User",userSchema);


const db=mongoose.connection;
db.once("open",()=>{
    console.log("db is connected");

    const rmCollection =db.collection("rooms");
    const changeStream2=rmCollection.watch();
    
    changeStream2.on("change",(change)=>{
        if(change.operationType==="insert")
         {
             const roomDetails=change.fullDocument;
            console.log(roomDetails._id);
            pusher.trigger("rooms","inserted",{
                 name:roomDetails.name,
                 _id:roomDetails._id
             });
      
         }
         else if(change.operationType==="update")
         {
           
            const key=change.documentKey._id;
             Room.findOne({_id:key},function(err,results){
                 if(!err)
                {
                     const len=results.messages.length;
                     if(len!==0){
                      pusher.trigger("rooms","updated",{
                         data:results.messages[len-1]
                      }
                    
                     );  
                    }  
                 }
             })

        }
        else
        {
            console.log("change else");
        }
    })
    const userCollection =db.collection("users");
    const changeStream3=userCollection.watch();
    
    changeStream3.on("change",(change)=>{
       if(change.operationType==="update")
         {
            
            User.findOne({_id:change.documentKey._id})
            .populate("actrooms").
            exec(function(err,room){
                if(err)
                {
                    console.log(err);
                }
                else
                {
                   pusher.trigger("users","updated",{
                       document:room.actrooms
                   })
                }
            })

         }
        else
        {
            console.log("change else ");
        }
    })



});

//api routes
app.get("/",function(req,res){
    res.status(200).send("<h1> Hello world </h1>")
})

app.post("/messages/new/:roomid",(req,res)=>{
    const roomID= req.params.roomid;
   
    
  const mess= {
      message:   req.body.message,
      name:       req.body.name,
      timestamp: req.body.timestamp,
      received:  req.body.received

  }
  

Room.updateOne({_id:roomID},{$push:{messages:mess}},function(err,success){
     if(err)
     {
         console.log("error is updating messages");
     }
     else
     {
        res.send("ok");
     }
 });

   
})

app.post("/users/new",(req,res)=>{
    console.log("called");
    const userdet=new User({
        name:req.body.name,
        email:req.body.email,
        
    })

    userdet.save(function(err,results){
        // if(err)
        // {
        //     console.log(err);
        // }
        // else
        // {
        //     console.log(results);
        // }
        if(err)
         console.log(err);
    })

})

app.post("/rooms/new",(req,res)=>{
    console.log('rooms new');
    const roomName =new Room({
        roomname:req.body.name
    })
     const usermail=req.body.user;
     roomName.save(function(err,data){
        if(err)
        {
            res.send(err);
        }
        else if(data)
        {
          User.updateOne({email:usermail},{$push:{roomIds:data._id,actrooms:data._id}},function(err,success){
                if(err)
                {
                    console.log(err);
                    console.log("error is done");
                }
                else
                {   
                  console.log("success");
                }
            });
          res.send(data._id);
        }
    })
})

app.post("/rooms/join",function(req,res){
    console.log("requested to join");
    const roomId=req.body.roomid;
    const target=req.body.user;
    Room.findOne({_id:roomId},function(err,results){
        if(err)
        {
            console.log("error");
        }
        else
        {
            console.log("room");
            User.updateOne({email:target},{$push:{roomIds:roomId,actrooms:roomId}},function(err,success){
                if(err)
                {
                    console.log("error");
                }
                else
                {
                  console.log("successfully joined");
                }
            })    
        }
    });   
})

app.post("/rooms/user",(req,res)=>{
    const user = req.body.user;
    User.findOne({email:user})
    .populate("actrooms").
    exec(function(err,room){
        if(err)
        {
            console.log(err);
        }
        else
        {
          if(room)
           res.send(room.actrooms);
          else
           res.send();
        }
    })
})

app.get("/rooms/sync",(req,res)=>{
    Room.find((err,data)=>{
        if(err)
        {
            res.status(500).send(err);
        }
        else
        {
            res.status(200).send(data);
        }
    })
})


app.get("/rooms/messages/:roomId",(req,res)=>{
    const roomID= req.params.roomId;
    Room.findOne({_id:roomID},function(err,results){
        if(err)
        {
            console.log("error at this particluar position");
        }
        else
        { 
            if(results)
             res.send(results.messages);
        }
    })
})

//listen
app.listen(port,function(req,res){
    console.log("listening on port 9000 ");
})
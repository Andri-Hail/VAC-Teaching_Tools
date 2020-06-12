var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const bodyParser = require("body-parser");
var massive = require("massive");
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var active_rooms = [];
var active_room_nums = {};
var notes = {};

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use(express.static('public'));
var cors = require('cors')
app.use(cors());

async function get_db(){
  global.db = await massive({
    host: 'ec2-54-235-208-103.compute-1.amazonaws.com',
    port: 5432,
    database: 'detvnn3mdquvt',
    user: 'vinsmrhumjjhvh',
    ssl:true,
    password: '8a593a286c542ea5dc58642686f606db229a3d7a5262c133cfab2afe4a4f277e',
    poolSize: 10

  });
  
}

get_db();

app.get("/",function(req,res){

	res.sendFile(__dirname + "/placeholder.html");
})

app.get("/day1",function(req,res){
	res.sendFile(__dirname + "/jsexample.html");
})

app.get("/review",function(req,res){
  res.sendFile(__dirname + "/reviewwizard.html");
})



app.get("/scd",function(req,res){
  res.sendFile(__dirname + "/scd.html");
})

app.get("/lesson",function(req,res){
  res.sendFile(__dirname + "/lesson.html");
})

app.get("/test",function(req,res){
  res.sendFile(__dirname + "/example.html");
})

app.get("/lesson",function(req,res){
  res.sendFile(__dirname + "/lesson.html");
})

app.get("/classroom",function(req,res){
  res.sendFile(__dirname + "/classroom.html");
})

app.get("/day2",function(req,res){
	res.sendFile(__dirname + "/day2.html");
})

app.get("/csd",function(req,res){
  res.sendFile(__dirname + "/csd.html");
})

app.get("/day3",function(req,res){
  res.sendFile(__dirname + "/day3.html");
})

app.get("/rnmaker",function(req,res){
  res.sendFile(__dirname + "/rnweb-component-generator.html");
})

app.get("/screens",function(req,res){
  res.sendFile(__dirname + "/screens.html");
})

app.get("/htmlexample",function(req,res){
  res.sendFile(__dirname + "/htmlexample.html");
})

app.get("/pizzaexample",function(req,res){
  res.sendFile(__dirname + "/shopexample.html");
})

app.get("/loadhtml",function(req,res){
  res.sendFile(__dirname + "/loadhtml.html");
})

app.get("/reactexample",function(req,res){
  res.sendFile(__dirname + "/reactexample.html");
})

app.get("/studenttracker",function(req,res){
  res.sendFile(__dirname + "/studentracker.html");
})

app.get("/studenttracker",function(req,res){
  res.sendFile(__dirname + "/studentracker.html");
})

app.get("/recipe",function(req,res){
  res.sendFile(__dirname + "/recipe.html");
})

app.get("/studentbackend", async function(req,res){

  var resp = {
    vac_text_templates:{
      data: await global.db.vac_text_templates.find({}),
      schema: {
        template_id:"text",
        text:"longtext"
      }
    },
    vac_email_templates:{
      data: await global.db.vac_email_templates.find({}),
      schema: {
         template_id:"text",
         text:"longtext",
         subject:"text"
      }
    },
    vac_students:{
      data: await global.db.vac_students.find({}),
      schema: {
         student_id:"text",
         first_name:"text",
         last_name:"text",
         email:"email",
         phone:"phone",
         parent_first_name:"text",
         parent_last_name:"text",
         parent_email:"email",
         parent_phone:"phone",
         class_id:"class_id",
      }
    },
    vac_instructors:{
      data: await global.db.vac_instructors.find({}),
      schema:{
         instructor_id:"number",
         first_name:"text",
         last_name:"text",
         email:"email",
         phone:"phone",
         venmo_handle:"text"
      }
    },
    vac_classes:{
      data: await global.db.vac_classes.find({}),
      schema:{
         class_id:"number",
         class_number:"text",
         instructor_id:"instructor_id",
         current_lesson:"number",
         day_of_week:"number",
         est_time:"number",
         text_reminders_on:"boolean",
         email_reminders_on:"boolean",
         email_template_id:"number",
         text_template_id:"number",
         zoomid:"text"
      }
    }
  }



  res.send(resp);
})

app.post("/studentbackend",async function(req,res){


  console.log(req.body);
  if(req.body.operation === "create"){
   var result = await global.db[req.body.table_name].insert(req.body.obj);
  } 
  if(req.body.operation === "update"){
    var ids = {
    vac_text_templates:"template_id",
    vac_email_templates:"template_id",
    vac_students:"student_id",  
    vac_instructors:"instructor_id",
    vac_classes:"class_id"
  }

  var filter = {};
  filter[ids[req.body.table_name]] = req.body.obj[ids[req.body.table_name]];


   var result = await global.db[req.body.table_name].update(filter, req.body.obj);
  } 
  res.send(result);
})

global.num_joined = 0;

io.on('connection', function(socket){
  global.num_joined ++;
   socket.on('function', function(msg){
    console.log(msg);
    socket.to(msg.room).broadcast.emit("function",msg);
   });

   socket.on('create_room', function(msg){
    socket.join(msg.room_name);
    active_rooms.push(msg.room_name);
    active_room_nums[msg.room_name] = 1;
    notes[msg.room_name] = [];
    io.emit("create_room",msg);

   });

 

  socket.on('note_sent', function(msg){
    //
    notes[msg.room_name].push(msg.note);
    io.in(msg.room_name).emit("note_sent",msg);
   });


   socket.on('join_room', function(msg){
    if(active_rooms.indexOf(msg.room_name) !== -1){
      socket.join(msg.room_name);
      active_room_nums[msg.room_name] += 1;
      msg.count = active_room_nums[msg.room_name];
      msg.notes = notes[msg.room_name];
      console.log(notes[msg.room_name])
      socket.emit("join_confirmed",msg);
      io.in(msg.room_name).emit("join_room",msg);

    }   
   });

    socket.on('disconnecting', function(){
      var self = this;
      var rooms = Object.keys(self.rooms);

      rooms.forEach(function(room){
          active_room_nums[room] = active_room_nums[room] - 1;
          socket.to(room).broadcast.emit("left_room",{count:active_room_nums[room]});
      });
  });


   socket.on('disconnect', function(msg){
    global.num_joined--;
    io.emit("joined",{num:global.num_joined});
   });

   socket.on('clear', function(msg){
    notes[msg.room_name] = [];
    io.to(msg.room_name).emit("clear",msg);
   });

   io.emit("joined",{num:global.num_joined, rooms: JSON.stringify(active_rooms) });



   socket.on('render_page', function(msg){

    socket.to(msg.room).broadcast.emit("render_page",msg);

   });

});

http.listen(process.env.PORT || 5000, function(){
  console.log('listening on *:5000');
});
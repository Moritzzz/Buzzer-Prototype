// Initialize packages
const express = require('express')
const socketio = require('socket.io')
const bodyParser = require('body-parser')
const app = express()
const Datastore = require('nedb')
const db = new Datastore()
const url = require('url')
const { body, validationResult, check } = require('express-validator');

app.set('view engine', 'ejs')
app.use(express.static('public')) // Initialize path
app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

// URL routing
app.get('/', (req, res) => {
    res.render('index')
}) // Base URL

app.get('/create', (req, res) => {
    res.render('create', {errors: null})
}) // Create Room URL

app.post('/create', 
    check('username', 'Must fill out a username').isLength({min: 1}).trim().escape(),
    (req, res) => {
        const errors = validationResult(req)

        if(!errors.isEmpty()) {
            res.render("create", {errors: errors.array()})
        } else {
            const { customAlphabet } = require('nanoid');
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            const nanoid = customAlphabet(alphabet, 6);

            let id = nanoid()

            let room = {
                id: id,
                users: [],
                admin: [],
                buzzer: {
                    locked: false,
                    currentBuzz: [],
                    buzzWinner: "",
                    buzzed: []
                }
            }

            db.insert(room, function(err, newDoc) {
                res.redirect(url.format({
                    pathname:"/room/admin",
                    query: {
                        "username": req.body.username,
                        "room": id
                    }
                }))
            })
        }
})

app.get('/join', (req, res) => {
    res.render('join', {errors: null, form: {username: null, room: null}})
}) // Join Room URL

app.post('/join', 
    check('username', 'Must fill out a username').trim().isLength({min: 1}).escape(),
    check('room', 'Must fill out a valid room code').trim().isLength({min: 6, max: 6}).escape(),
    (req, res) => {
        let errors = validationResult(req).array()

        let errors2 = []

        if(errors.length != 0) {
            res.render("join", {errors: errors, form: req.body})
        } else {
            db.findOne({id: req.body.room}, function(err, doc) {
                if(doc == null) {
                    res.render("join", {errors: [{msg: "That room does not exist"}], form: req.body})
                } else {
                    if(doc.users.includes(req.body.username)) {
                        res.render("join", {errors: [{msg: "That username is already taken"}], form: req.body})
                    }
                    
                    res.redirect(url.format({
                        pathname:"/room/guest",
                        query: {
                            "username": req.body.username,
                            "room": req.body.room
                        }
                    }))
                }
            })
        }
})

app.get('/room', (req, res) => {
    res.render('room')
}) // Room URL

app.get('/room/admin', (req, res) => {
    res.render('room', {username: req.query.username, room: req.query.room, isAdmin: true})
}) // Room URL

app.get('/room/guest', (req, res) => {
    res.render('room', {username: req.query.username, room: req.query.room, isAdmin: false})
}) // Room URL

// Initialize server
const server = app.listen(3000, () => {
    console.log('Server Started')
})

const io = socketio(server)

io.on('connection', socket => {
    console.log("User Connected")

    socket.on("createRoom", data => {
        socket.room = data.room
        socket.username = data.username
        socket.team = data.username
        socket.isAdmin = true
        socket.join(socket.room)

        db.findOne({id: socket.room}, function(err, doc) {
            if(doc) {
                db.update({id: socket.room}, {$push: {users: socket.username}, $set: {admin: socket.username}}, {}, function() {
                    console.log("Room With ID: ", socket.room, "Created By: ", socket.username)
        
                    socket.emit("joinSuccess", {room: socket.room})
        
                    db.findOne({id: socket.room}, function(err, doc) {
                        if(doc) {
                            io.in(socket.room).emit("updateUsers", {users: doc.users})
                        }
                    })
                })
            } else {
                socket.emit("joinFailure")
            }
        })
    })

    socket.on("joinRoom", data => {
        socket.room = data.room
        socket.username = data.username
        socket.team = data.username
        socket.isAdmin = false
        socket.join(socket.room)

        db.findOne({id: socket.room}, function(err, doc) {
            if(doc) {
                db.update({id: socket.room}, {$push: {users: socket.username}}, {}, function() {
                    console.log("Room With ID: ", socket.room, "Joined By: ", socket.username)
        
                    socket.emit("joinSuccess", {room: socket.room})
        
                    db.findOne({id: socket.room}, function(err, doc) {
                        if(doc) {
                            io.in(socket.room).emit("updateUsers", {users: doc.users})
                        }
                    })
                })
            } else {
                socket.emit("joinFailure")
            }
        })
    })

    socket.on("disconnect", data => {
        if(socket.room) {
            if(socket.isAdmin) {
                db.remove({id: socket.room}, function() {})
                console.log(socket.room, " Has Been Dissolved")
                io.in(socket.room).emit("dissolveRoom")
            } else {
                db.findOne({id: socket.room}, function(err, doc) {
                    if(doc) {
                        db.update({id: socket.room}, {$pull: {users: socket.username}}, {}, function() {
                            db.findOne({id: socket.room}, function(err, doc) {
                                io.in(socket.room).emit("updateUsers", {users: doc.users})
                                console.log(socket.username, " Has Left Room: ", socket.room)
                            })
                        })
                    }
                })
            }
        }
    })

    socket.on("buzz", data => {
        db.findOne({id: socket.room}, function(err, doc) {
            if(doc.buzzer.locked == false && !doc.buzzer.buzzed.some((a) => a[0] == socket.team) && !doc.buzzer.currentBuzz.some((a) => a[0] == socket.team)) {
                db.update({id: socket.room}, {$push: {"buzzer.currentBuzz": [socket.team, data.time]}, $set: {"buzzer.buzzWinner": ""}}, {multi: true}, function() {})
                db.findOne({id: socket.room}, function(err, doc) {
                    io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
                })

                if(!doc.buzzer.currentBuzz.length) {
                    setTimeout(function() {
                        db.update({id: socket.room}, {$set: {"buzzer.locked": true}}, {}, function() {})
    
                        db.findOne({id: socket.room}, function(err, doc) {
                            let buzzes = doc.buzzer.currentBuzz
    
                            buzzes.sort(function(a, b) { 
                                return a[1] > b[1] ? 1 : -1;
                            });
    
                            db.update({id: socket.room}, {$push: {"buzzer.buzzed": buzzes[0]}, $set: {"buzzer.currentBuzz": [], "buzzer.buzzWinner": buzzes[0]}}, {multi: true}, function() {
                                db.findOne({id: doc.id}, function(err, doc) {
                                    io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
                                })
                            })
                        })
    
                        
                    }, 1000)
                }
            }
        })
    })

    socket.on("unlockBuzzer", function() {
        db.update({id: socket.room}, {$set: {"buzzer.locked": false, "buzzer.buzzWinner": ""}}, {multi: true}, function() {
            db.findOne({id: socket.room}, function(err, doc) {
                io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
            })
        })
    })

    socket.on("resetBuzzer", function() {
        db.update({id: socket.room}, {$set: {"buzzer.locked": false, "buzzer.currentBuzz": [], "buzzer.buzzWinner": "", "buzzer.buzzed": []}}, {multi: true}, function() {
            db.findOne({id: socket.room}, function(err, doc) {
                io.in(socket.room).emit("updateBuzzer", {buzzer: doc.buzzer})
            })
        })
    })
})
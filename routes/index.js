var express = require('express');
var cookieParser = require('cookie-parser');
var router = express.Router();
router.use(cookieParser());
// node pakketje om korte uniqe ids te maken
var shortid = require('shortid');
// mysql incliden en verbinding maken met db
var mysql = require('mysql');
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'quizwiz',
    password: 'v00rk3nn1s',
    database: 'quizwiz'
});

connection.connect();

var question = "";

// zelf gemaakte middleware om te checken of het quizwiz koekje bestaat, en zo niet, maken die handel
router.use('/', function(req, res, next) {
    // check if client sent cookie
    if (!("quizwizcookieid" in req.cookies)) {
        // no: set a new cookie
        var uniqid = shortid.generate();
        res.cookie('quizwizcookieid', uniqid, { maxAge: 900000, httpOnly: true });
        req.cookies.quizwizcookieid = uniqid;
    } else {
        // yes, cookie was already present 
    }
    next(); // <-- important! want hij moet de rest van de pagina nog ladennnnnn
});
/* GET home page. */
router.get('/', function(req, res, next) {
    connection.query('SELECT * FROM TEMP_homepage_questions thq ORDER BY RAND() LIMIT 1', function(error, results, fields) {
        if (error) throw error;
        question = results[0];
        question.answers = [];
        connection.query('SELECT * FROM TEMP_homepage_answers WHERE question_id=' + question.id + ' ORDER BY id', function(error, results, fields) {
            if (error) throw error;
            for (var i = 0; i < results.length; i++) {
                question.answers.push({ "id": results[i].id, "answer": results[i].answer, "correct": results[i].correct });
            }
            res.render('index', { question: question.question, answer1: question.answers[0].answer, answer2: question.answers[1].answer, answer3: question.answers[2].answer, answer4: question.answers[3].answer });
        });
    });
});

router.post('/hpbuttonclick/:id', function(req, res, next) {
    connection.query('INSERT INTO TEMP_homepage_useranswers SET cookie_id="' + req.cookies.quizwizcookieid + '", answer_id = ' + question.answers[parseInt(req.params.id)].id, function(error, results, fields) {
        if (parseInt(question.answers[parseInt(req.params.id)].correct) === 1) {

        }
        res.json({ correct: parseInt(question.answers[parseInt(req.params.id)].correct) });
    });
});
module.exports = router;
var express = require('express');
var cookieParser = require('cookie-parser');
// library for promises, zodat ik ook dingen synchroon kan doen (in de strijd tegen callback hell, voor queryies die afhankelijk zijn van queries etc)
var q = require('q');
var router = express.Router();
router.use(cookieParser());
// node pakketje om korte uniqe ids te maken
var shortid = require('shortid');
// mysql incliden en verbinding maken met db
var mysql = require('mysql');
var pool = mysql.createPool({
    host: 'localhost',
    user: 'quizwiz',
    password: 'v00rk3nn1s',
    database: 'quizwiz'
});

function getConnectionFromPool() {
    var deferred = q.defer();
    pool.getConnection(function(err, connection) {
        deferred.resolve(connection);
    });
    return deferred.promise;
}

function doQuery(queryTemplate, parameters) {
    var deferred = q.defer();
    getConnectionFromPool()
        .then(function(connection) {
            var query = mysql.format(queryTemplate, parameters);
            console.log('Query to execute:' + query);
            connection.query(query, function(error, result) {
                if (error) {
                    console.error(error);
                    deferred.reject(error);
                }
                connection.release();
                deferred.resolve(result);
            });
        })
        .fail(function(err) {
            console.error(JSON.stringify(err));
            deferred.reject(err);
        });

    return deferred.promise;
}


// DEPRECATED functie om connectie te maken en query uit te voeren
function getRandomHPQuestion() {
    // maak promise aan om te retourneren
    var deferred = q.defer();
    // haal een getconnectionpromise op, en als die resolved call de then () functie
    doQuery('SELECT * FROM TEMP_homepage_questions thq ORDER BY RAND() LIMIT 1', []).then(function(questiondata) {
        // als de vorige promise geresolved is, kunnen we aan de slag met het query result
        var question = questiondata[0];
        question.answers = [];
        doQuery('SELECT * FROM TEMP_homepage_answers WHERE question_id=? ORDER BY id', [question.id]).then(function(answerdata) {
            for (var i = 0; i < answerdata.length; i++) {
                // maak een array met antwoorden
                question.answers.push({ "id": answerdata[i].id, "answer": answerdata[i].answer, "correct": answerdata[i].correct });
            }
            deferred.resolve(question);
        });
        // resolve de promise met nu het hele question object

    });
    // retourneer de hele promise, die dus geresolved wordt in de subquery hierboven
    return deferred.promise;
}

// nieuw: alles opvragen in 1 query, en bovendien alleen een vraag ophalen waarvoor deze cookie id nog geen antwoord heeft gegeven
function getHPQuestion(cookieId) {
    var deferred = q.defer();
    doQuery('SELECT t1.id, t1.question, t2.id AS answer_id, t2.question_id, t2.answer, t2.correct FROM (SELECT id, question FROM TEMP_homepage_questions thq WHERE thq.id NOT IN (SELECT question_id FROM TEMP_homepage_answers tha LEFT JOIN TEMP_homepage_useranswers thu ON thu.answer_id = tha.id AND thu.cookie_id=? WHERE thu.answer_id IS NOT NULL) ORDER BY RAND() LIMIT 1) AS t1 LEFT JOIN TEMP_homepage_answers t2 ON t2.question_id = t1.id ORDER BY answer_id', [cookieId]).then(function(questiondata) {
        var question = {};
        question.id = questiondata[0].id;
        question.text = questiondata[0].question;
        question.answers = [];
        for (var i = 0; i < questiondata.length; i++) {
            question.answers.push({ "id": questiondata[i].answer_id, "answer": questiondata[i].answer, "correct": questiondata[i].correct });
        }
        deferred.resolve(question);
    });
    return deferred.promise;
}


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
    getHPQuestion(req.cookies.quizwizcookieid).then(function(question) {
        res.render('index', { question: question.text, answer1: question.answers[0].answer, answer2: question.answers[1].answer, answer3: question.answers[2].answer, answer4: question.answers[3].answer });
    });

});

router.post('/hpbuttonclick/:id', function(req, res, next) {
    processHPAnswer(req.cookies.quizwizcookieid, parseInt(req.params.id)).then(function(correct) {
        connection.query('INSERT INTO TEMP_homepage_useranswers SET cookie_id="' + req.cookies.quizwizcookieid + '", answer_id = ' + question.answers[parseInt(req.params.id)].id, function(error, results, fields) {
            if (parseInt(question.answers[parseInt(req.params.id)].correct) === 1) {

            }
            res.json({ correct: parseInt(question.answers[parseInt(req.params.id)].correct) });
        });

    });

});
module.exports = router;
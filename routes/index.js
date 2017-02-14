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


// maak een synchrone functie voor een db connectie:
function getConnection() {
    // dit is het object dat we gaan returnen als "promise"
    var deferred = q.defer();
    // maak connectieobject aan 
    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'quizwiz',
        password: 'v00rk3nn1s',
        database: 'quizwiz'
    });
    // call connect functie, en IN de callback van de functie resolven we de promise
    connection.connect(function(err) {
        if (err) {
            console.error(err);
            deferred.reject(err);
        }
        console.log('[CONN] – Connection created with id:' + connection.threadId);
        // kijk maar, we geven de resolve method het connection object mee, zodat we er na het resolven bij kunnen. 
        deferred.resolve(connection);
    });
    // retourneer de promise 
    return deferred.promise;
}

function doQuery(queryTemplate, parameters) {
    var deferred = q.defer();

    connectionManager.getConnection()
        .then(function(connection) {
            var query = connectionManager.prepareQuery(queryTemplate, parameters);
            console.log('Query to execute:' + query);
            connection.query(query, function(error, result) {
                if (error) {
                    console.error(error);
                    deferred.reject(error);
                }
                deferred.resolve(result);
            });
        })
        .fail(function(err) {
            console.error(JSON.stringify(err));
            deferred.reject(err);
        });

    return deferred.promise;
}
// functie om connectie te maken en query uit te voeren
function getRandomHPQuestion() {
    // maak promise aan om te retourneren
    var deferred = q.defer();
    // haal een getconnectionpromise op, en als die resolved call de then () functie
    getConnection()
        .then(function(connection) { // then wordt gecalled als de promise geresolved is
            var deferred2 = q.defer();
            connection.query('SELECT * FROM TEMP_homepage_questions thq ORDER BY RAND() LIMIT 1', function(error, results, fields) {
                if (error) {
                    console.error(error);
                    deferred2.reject(error);
                }
                //  de nieuwe promise wordt geresolved in deze query callback, en geeft de connectie wederom terug zodat we er in de volgende functie bij kunnen, en ook het result van de query
                deferred2.resolve({ "connection": connection, "result": results[0] });
            });
            return deferred2.promise;
        })
        .then(function(stuff) {
            // als de vorige promise geresolved is, kunnen we aan de slag met het query result
            var question = stuff.result;
            var connection = stuff.connection;
            question.answers = [];
            // op basis daarvan voeren we een subquery uit
            connection.query('SELECT * FROM TEMP_homepage_answers WHERE question_id=' + question.id + ' ORDER BY id', function(error, results, fields) {
                if (error) {
                    console.error(error);
                    deferred.reject(error);
                }
                for (var i = 0; i < results.length; i++) {
                    // maak een array met antwoorden
                    question.answers.push({ "id": results[i].id, "answer": results[i].answer, "correct": results[i].correct });
                }
                // resolve de promise met nu het hele question object
                deferred.resolve(question);
            });
        })
        .fail(function(err) {
            console.error(JSON.stringify(err) + "?");
            deferred.reject(err);
        });
    // retourneer de hele promise, die dus geresolved wordt in de subquery hierboven
    return deferred.promise;
}


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
    getRandomHPQuestion().then(function(question) {
        res.render('index', { question: question.question, answer1: question.answers[0].answer, answer2: question.answers[1].answer, answer3: question.answers[2].answer, answer4: question.answers[3].answer });
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
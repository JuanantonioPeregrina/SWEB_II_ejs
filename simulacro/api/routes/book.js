const express = require('express');
const router = express.Router();
const dbo = require('../db/conn');
const ObjectId = require('mongodb').ObjectId;
const MAX_RESULTS = parseInt(process.env.MAX_RESULTS);
const COLLECTION = 'books';

const Ajv = require("ajv");
const ajv = new Ajv();
const addFormats = require("ajv-formats"); 
addFormats(ajv); // ESTO ES LO QUE ME FALTABA
const schema = {
  type: "object",
  properties: {
    isbn: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    subtitle: { type: "string" },
    author: { type: "string", minLength: 1 },
    published: { type: "string", format: "date-time" },
    publisher: { type: "string" },
    pages: { type: "integer", minimum: 1 },
    description: { type: "string" },
    website: { type: "string", format: "uri" },
    genres: {
      type: "array",
      items: { type: "string", minLength: 1 }
    }
  },
  required: ["isbn", "title", "author"],
  additionalProperties: false
};


const validate = ajv.compile(schema);


//getBooks()
router.get('/', async (req, res) => {
  let limit = MAX_RESULTS; //en el .env 
  if (req.query.limit){
    limit = Math.min(parseInt(req.query.limit), MAX_RESULTS); //paginacion
  }
  let next = req.query.next;
  let query = {}

  // ✅ AÑADIR filtro para (query parameter) número de páginas (atributo pages)
  if (req.query.pages) {
    const numPages = parseInt(req.query.pages);
    if (!isNaN(numPages)) {
      query.pages = numPages;
    }
  }


  if (next){
    query = {_id: {$lt: new ObjectId(next)}}
  }
  const dbConnect = dbo.getDb();
  let results = await dbConnect
    .collection(COLLECTION)
    .find(query, { projection: { results: 1, next: 1 } })
    .sort({_id: -1})
    .limit(limit)
    .toArray()
    .catch(err => res.status(400).send('Error searching for books'));
  next = results.length == limit ? results[results.length - 1]._id : null;
 
  //res.json({results, next}).status(200);

  // Añadir campo 'link' a cada libro
results = results.map(book => ({
  ...book,
  link: `${req.protocol}://${req.get('host')}${req.baseUrl}/${book._id}`
}));

res.status(200).json({ results, next });

});



//getBookById()
router.get('/:id', async (req, res) => {
  const dbConnect = dbo.getDb();
  let query = {_id: new ObjectId(req.params.id)};
  let result = await dbConnect
    .collection(COLLECTION)
    .findOne(query);
  if (!result){
    res.send("Not found").status(404);
  } else {
    res.status(200).send(result);
  }
});

//addBook()
/*router.post('/', async (req, res) => {
  const dbConnect = dbo.getDb();
  console.log(req.body);
  let result = await dbConnect
    .collection(COLLECTION)
    .insertOne(req.body);
  res.status(201).send(result);
}); */
router.post('/', async (req, res) => {
  try {
    const valid = validate(req.body);
    if (!valid) {
      return res.status(400).json({ error: "Datos inválidos", details: validate.errors });
    }

    const dbConnect = dbo.getDb();
    const result = await dbConnect.collection(COLLECTION).insertOne(req.body);
    res.status(201).send(result);
  } catch (err) {
    console.error("Error al crear libro:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});


//deleteBookById()
router.delete('/:id', async (req, res) => {
  //const query = { _id: new ObjectId(req.params.id) };
  const id = req.params.id;

  // ✅ Validar que el ID sea un ObjectId válido
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: 'Invalid book ID' });
  }

  const query = { _id: new ObjectId(id) };
  const dbConnect = dbo.getDb();
  let result = await dbConnect
    .collection(COLLECTION)
    .deleteOne(query);
  
   // ✅ Comprobar si se eliminó algo
   if (result.deletedCount === 0) {
    return res.status(404).send({ error: 'Book not found' });
  }
    res.status(200).send(result);
});


router.put('/:id', async (req, res) => {
  const id = req.params.id;

  // ✅ Validar que el ID tenga formato correcto
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  // ✅ Validar el objeto recibido con AJV
  const valid = validate(req.body);
  if (!valid) {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalles: validate.errors
    });
  }

  try {
    const dbConnect = dbo.getDb();

    // ✅ Intentar actualizar el libro
    const result = await dbConnect.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body }
    );

    // ✅ Comprobar si el libro existía
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    res.status(200).json({ message: 'Libro actualizado correctamente' });
  } catch (err) {
    console.error("Error al actualizar libro:", err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


module.exports = router;

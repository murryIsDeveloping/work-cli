#! /usr/bin/env node

const fs = require('fs')
const fetch = require('node-fetch');
const { pipe, isEmpty, not, repeat, join, uniq, mergeDeepWith } = require('ramda')
const inquirer = require('inquirer')

const notEmpty = pipe(isEmpty, not)
const indent = pipe(repeat('  '), join(''))

const getType = (value) => {
    switch(typeof value) {
        case('string'):
            return `PropType.string`
        case('number'):
            return `PropType.number`
        case('boolean'):
            return `PropType.bool`
        default:
            return ''
    }
}

const isObject = x => typeof x === 'object' && x !== null
const shouldRecurse = x => isObject(x) || Array.isArray(x)

const aggValuesDeep = value => isObject(value[0]) 
  ? value.reduce(mergeDeepWith((l, r) => {
    const isArray = Array.isArray(l)
    return isArray ? [aggValuesDeep([...l, ...r])] : r
  })) 
: value[0]

const createRoughSchema = (data) => {
    const transformRec = (value, depth) => {
        if(Array.isArray(value) && notEmpty(value)) {
            const types = uniq(value.map(x => transformRec(x, depth+1)))
            const arrayPropTypes = types.length > 1 
                ? `PropType.oneOfType([\n${types.join(',\n')}\n${indent(depth)}])`
                : types[0]

            return `PropType.arrayOf(\n${indent(depth)}${arrayPropTypes}\n${indent(depth)})`
        }

        if(isObject(value) && notEmpty(value)) {
            const struct = Object.entries(value).map(([key, value]) => {
                const schema = shouldRecurse(value) ? transformRec(value, depth+1) : getType(value)
                return `${indent(depth)}${key}: ${schema},`
            }).join('\n')
            return `PropType.shape({\n${struct}\n${indent(depth)}})`
        }

        return `${indent(depth)}${getType(value)}`
    }

    return transformRec(data, 1)
}


const createBasicParser = (data, name) => {
  const schema = createRoughSchema(data)

  const propTypeContent = `
import PropType from 'prop-types'

const ${name} = ${schema}

export default ${name}

`

  fs.writeFileSync(`src/propTypes/${name}.js`, propTypeContent)
}

const propTypesQuestions = {
  init: [
    {
      type: 'input',
      name: 'fileName',
      message: "Name of the file",
    },
    {
      type: 'list',
      name: 'source',
      message: "Source for the JSON data",
      choices: [
        'URL',
        'JSON'
      ]
    },
  ],
  json: [{
    type: 'editor',
    name: 'data',
    message: "JSON of data you want propTypes for",
    validate: (value) => {
      try {
        JSON.parse(value)
        return true
      } catch (error) {
        return 'Please enter a valid JSON string'
      }
    },
  }],
  url: [{
    type: 'input',
    name: 'data',
    message: "GET url of the raw data",
  }],
}

const [arg, ...flags] = process.argv.slice(2);

if(arg === 'propType') {
  inquirer.prompt(propTypesQuestions.init)
  .then(({ source, fileName }) => {
      if(source === 'JSON'){
        inquirer.prompt(propTypesQuestions.json)
          .then(({ data }) => {
            const input = JSON.parse(data)
            createBasicParser(input, fileName)
          })
      }

      if(source === 'URL'){
        inquirer.prompt(propTypesQuestions.url)
          .then(({ data }) => {
            fetch(data)
              .then(res => res.json())
              .then(res => {
                createBasicParser(res, fileName)
              })         
          })
      }
  })
}

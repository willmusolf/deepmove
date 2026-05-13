import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataPath = path.resolve(__dirname, '../frontend/src/components/Board/gameRatingCalibrationData.json')

function sideResult(result, color) {
  if (result === '1-0') return color === 'white' ? 'win' : 'loss'
  if (result === '0-1') return color === 'black' ? 'win' : 'loss'
  return 'draw'
}

function resultFeature(result, color) {
  const side = sideResult(result, color)
  if (side === 'win') return 1
  if (side === 'loss') return -1
  return 0
}

function buildRows(games) {
  const rows = []
  for (const game of games) {
    const white = game.players.white
    const black = game.players.black
    rows.push({
      gameId: game.gameId,
      color: 'white',
      playerRating: white.rating,
      opponentRating: black.rating,
      accuracy: white.deepmoveAccuracy,
      resultValue: resultFeature(game.result, 'white'),
      target: white.chesscomGameRating,
    })
    rows.push({
      gameId: game.gameId,
      color: 'black',
      playerRating: black.rating,
      opponentRating: white.rating,
      accuracy: black.deepmoveAccuracy,
      resultValue: resultFeature(game.result, 'black'),
      target: black.chesscomGameRating,
    })
  }
  return rows
}

function transpose(matrix) {
  return matrix[0].map((_, columnIndex) => matrix.map(row => row[columnIndex]))
}

function multiplyMatrices(left, right) {
  return left.map(row =>
    right[0].map((_, columnIndex) =>
      row.reduce((sum, cell, index) => sum + cell * right[index][columnIndex], 0),
    ),
  )
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map(row => row.reduce((sum, cell, index) => sum + cell * vector[index], 0))
}

function solveLinearSystem(matrix, vector) {
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  const size = augmented.length

  for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
    let maxRow = pivotIndex
    for (let row = pivotIndex + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivotIndex]) > Math.abs(augmented[maxRow][pivotIndex])) {
        maxRow = row
      }
    }

    if (Math.abs(augmented[maxRow][pivotIndex]) < 1e-9) {
      throw new Error('Calibration matrix is singular; cannot solve least-squares system.')
    }

    if (maxRow !== pivotIndex) {
      const temp = augmented[pivotIndex]
      augmented[pivotIndex] = augmented[maxRow]
      augmented[maxRow] = temp
    }

    const pivot = augmented[pivotIndex][pivotIndex]
    for (let column = pivotIndex; column <= size; column += 1) {
      augmented[pivotIndex][column] /= pivot
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivotIndex) continue
      const factor = augmented[row][pivotIndex]
      for (let column = pivotIndex; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivotIndex][column]
      }
    }
  }

  return augmented.map(row => row[size])
}

function meanAbsoluteError(rows, coefficients) {
  return rows.reduce((sum, row) => {
    const prediction =
      coefficients[0]
      + coefficients[1] * row.playerRating
      + coefficients[2] * row.opponentRating
      + coefficients[3] * row.accuracy
      + coefficients[4] * row.resultValue
    return sum + Math.abs(row.target - prediction)
  }, 0) / rows.length
}

async function main() {
  const games = JSON.parse(await fs.readFile(dataPath, 'utf8'))
  const rows = buildRows(games)
  const design = rows.map(row => [1, row.playerRating, row.opponentRating, row.accuracy, row.resultValue])
  const targets = rows.map(row => row.target)

  const xt = transpose(design)
  const xtx = multiplyMatrices(xt, design)
  const xty = multiplyMatrixVector(xt, targets)
  const coefficients = solveLinearSystem(xtx, xty)

  console.log(JSON.stringify({
    sampleCount: rows.length,
    coefficients: {
      intercept: coefficients[0],
      playerRating: coefficients[1],
      opponentRating: coefficients[2],
      accuracy: coefficients[3],
      result: coefficients[4],
    },
    meanAbsoluteError: meanAbsoluteError(rows, coefficients),
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

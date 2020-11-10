const express = require('express')
const app = express()
const fs = require('fs')
const cors = require('cors')
const bodyParser = require('body-parser')

app.use(cors())
app.use(express.static('./'))
app.use(bodyParser.json())

// Load portfolios under this customer
// You may add/remove portfolios of this customer in ./portfolio.json
// Also file may be used to write what's allocated to the portfolio (not required this time, just bonus)
const portfolioConfig = JSON.parse(fs.readFileSync('portfolio.json'))
const plans = ['onetime', 'monthly']

/*** 
 * Routes ***/
app.listen(3000, () => {
  console.log('Server started')
});

app.get('/', (req, res) => {
  res.sendFile('index.html')
});

app.get('/portfolio', (req, res) => {
  res.json(portfolioConfig)
})

app.post('/deposit', (req, res) => {
  const fundDeposits = req.body.fund_deposit
  
  // Init plan object
  // Avoiding hard-code plan
  const depositPlans = {}
  plans.forEach(plan => {
    depositPlans[plan] = {
      'total': 0,
      'portfolio_assign': req.body[plan]
    }
  })

  // Sum up deposit plans and depositPlan totals
  let sumPlan = 0
  plans.forEach(plan => {
    let porfolioKeys = Object.keys(depositPlans[plan].portfolio_assign)
    porfolioKeys.forEach(key => {
      depositPlans[plan].total += parseFloat(depositPlans[plan].portfolio_assign[key].plan_value)      
    })
    sumPlan += depositPlans[plan].total
  })

  let result = assignDeposits(fundDeposits, depositPlans, sumPlan)
  res.json(result)
})

/*** 
 * Methods 
 * ***/
const assignDeposits = function(deposits, depositPlans, sumPlan){
  let portfolio = JSON.parse(JSON.stringify(portfolioConfig))
  const portfolioKeys = Object.keys(portfolio)
  let result = {
    'portfolio'  : {}, 
    'message'    : [],
    'skipped'    : 'Skipped deposits due to invalid value: ',
    'skip_count' : 0
  }
  /*
  1. Iterate and validate through deposits
  2. Check if deposit equals onetime + monthly total
    - Split deposit to portfolios according to deposit plan (see note below on implementation)
  3. Else: 
  3a Assign plan one-time first
  3b.Assign plan monthly next
  4. For both plans:
    a. If deposit matches plan.total, directly split up according to plan referring by portfolio key
    b. Else, split by ratio. Calculate out ratio of split of the portfolio from total portfolio value stated in the plan
  */
  deposits.forEach(deposit => {
    let currentDeposit = 0
    if(deposit == ''){ return; }
    if(!isNumeric(deposit)){
      result.skipped += `<li> ${deposit} </li>`
      result.skip_count++;
      return // skip invalid deposit
    }

    currentDeposit = parseFloat(deposit)
    if(currentDeposit === sumPlan){
      // Assign both onetime and monthly plans if exact
      // In reality, if plan = monthly, monthly deposit will be on hold first, 
      // to be processed by a schedule later (early of month)
      portfolio = assignAllPlanPortfolioExact(depositPlans, portfolio)
      return
    }

    // 4a Distribute exact deposit
    plans.forEach(plan => {
      if(currentDeposit <= 0){
        return
      }      

      if(currentDeposit === depositPlans[plan].total){
        let result = assignExactDeposit(plan, depositPlans, portfolio, currentDeposit)
        portfolio = result.portfolio
        currentDeposit = result.currentDeposit
      }
    })

    // 4b. If currentDeposit is still not distributed, split by ratio into non-zero sum plan
    if(currentDeposit > 0){      
      plans.forEach(plan => {
        if(depositPlans[plan].total <= 0){
          return // skip plan as there is no deposit required
        }        
        if(currentDeposit == 0){
          return // skip when all distributed
        }
        console.log(`Split ${currentDeposit} by ratio`)
        let ratios = splitRatio(plan, depositPlans, portfolioKeys)   
        let referenceDeposit = Math.round(currentDeposit * 100) / 100
        console.log(ratios)
        portfolioKeys.forEach(key => {
          if(ratios[key] === 0){
            return
          }
          if(ratios[key] === 1){
            let msg = `No split required for \$ ${referenceDeposit}. Distribute all to portfolio: <b>${portfolio[key].name}</b>`
            console.log(msg)
            result.message.push(msg)
            portfolio[key].value += referenceDeposit
            currentDeposit -= referenceDeposit
          }

          if(ratios[key] < 1){
            let split = Math.round((referenceDeposit * ratios[key]) * 100) / 100
            portfolio[key].value += split
            currentDeposit -= split

            let msg = `Distribute \$ ${referenceDeposit} by split ratio of ${ratios[key]} (\$ ${split}) to this portfolio: <b>${portfolio[key].name}</b>`
            console.log(msg)
            result.message.push(msg)
          }
        })
      })
    }
  })

  result.portfolio = portfolio
  return result
}

const splitRatio = function(plan, depPlan, portfolioKeys){
  let r = {}
  portfolioKeys.forEach(key => {
    let plan_value = parseFloat(depPlan[plan].portfolio_assign[key].plan_value)
    let ratio = plan_value / depPlan[plan].total 
    r[key] = Math.round(ratio * 100) / 100
  })
  return r
}

const assignExactDeposit = function(plan, depPlan, portfolio, currentDep) {
  const portfolioKeys = Object.keys(portfolio)
  portfolioKeys.forEach(key => {          
    let plan_value = parseFloat(depPlan[plan].portfolio_assign[key].plan_value)
    currentDep -= plan_value
    portfolio[key].value += plan_value
  })

  return {currentDeposit: currentDep, portfolio: portfolio}
}

const assignAllPlanPortfolioExact = function(depPlan, portfolio) {
  const portfolioKeys = Object.keys(portfolio)
  plans.forEach(plan => {
    portfolioKeys.forEach(key => {
      portfolio[key].value += parseFloat(depPlan[plan].portfolio_assign[key].plan_value)
    })
  })

  return portfolio
}

const isNumeric = function(str) {
  if (typeof str != "string") return false  
  return !isNaN(str) && !isNaN(parseFloat(str))
}